#!/usr/bin/env python3
"""Reduce SPZ v3 SH=0 files to a decimal MB budget by deterministic pruning.
Preserves the exact encoded attributes of retained splats; does not retrain or
compensate for removed splats. Spatial coverage is protected on a coarse grid.
Requires numpy and pigz. Originals and existing output files are never overwritten.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import time
import numpy as np

WIDTHS = (9, 1, 3, 3, 4)

def decode(data):
    header = struct.unpack('<IIIBBBB', data[:16])
    magic, version, n, sh, bits, flags, reserved = header
    if magic != 1347635022 or version != 3 or sh != 0 or flags & 128:
        raise ValueError('Only SPZ v3 SH=0 without LOD is supported')
    if len(data) != 16 + n * 20:
        raise ValueError('Unexpected payload length')
    fields, offset = [], 16
    for width in WIDTHS:
        fields.append(np.frombuffer(data, np.uint8, n * width, offset).reshape(n, width))
        offset += n * width
    return header, fields

def coordinates(fields):
    p = fields[0].reshape(-1, 3, 3).astype(np.int32)
    xyz = p[:, :, 0] | p[:, :, 1] << 8 | p[:, :, 2] << 16
    return (xyz << 8) >> 8

def priorities(fields, xyz):
    # Average projected area of the scale ellipsoid, times opacity.
    scales = np.exp(fields[3].astype(np.float32) / 16 - 10)
    score = fields[1][:, 0].astype(np.float32) * (
        scales[:, 0] * scales[:, 1] + scales[:, 0] * scales[:, 2] + scales[:, 1] * scales[:, 2])
    # Deterministic tiny tie breaker avoids preference for input ordering.
    ids = np.arange(len(score), dtype=np.uint64)
    h = ((ids * np.uint64(2654435761)) & np.uint64(0xffffffff)).astype(np.float64) / 4294967296
    rank = score.astype(np.float64) * (1 + h * 1e-6) + h * 1e-30
    # Keep the strongest splat in every occupied cell of a 128^3 scene grid.
    lo = xyz.min(axis=0); span = np.maximum(xyz.max(axis=0) - lo + 1, 1)
    cell = np.minimum(((xyz.astype(np.int64) - lo) * 128) // span, 127)
    key = cell[:, 0] + 128 * cell[:, 1] + 16384 * cell[:, 2]
    maximum = np.full(128**3, -np.inf)
    np.maximum.at(maximum, key, rank)
    protected = rank == maximum[key]
    return rank, protected

def write_candidate(path, data, fields, selected):
    header = bytearray(data[:16]); struct.pack_into('<I', header, 8, len(selected))
    with path.open('wb') as f:
        p = subprocess.Popen(['pigz', '-9', '-p', '4', '-n'], stdin=subprocess.PIPE, stdout=f)
        try:
            p.stdin.write(header)
            for a in fields:
                for start in range(0, len(selected), 500000):
                    p.stdin.write(a[selected[start:start + 500000]].tobytes())
            p.stdin.close()
            if p.wait() != 0: raise RuntimeError('pigz failed')
        finally:
            if p.poll() is None: p.kill(); p.wait()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=Path('Map2World/static/spz'))
    parser.add_argument('--output-dir', type=Path, default=Path('Map2World/static/spz/under90mb'))
    parser.add_argument('--report-dir', type=Path, required=True)
    parser.add_argument('--target-mb', type=float, default=90)
    parser.add_argument('--files', nargs='+', help='Source basenames to process (default: all SPZ files)')
    args = parser.parse_args()
    limit = int(args.target_mb * 1000000)
    if limit <= 0: raise ValueError('target must be positive')
    sources = sorted(args.source_dir.glob('*.spz'))
    if args.files:
        requested = set(args.files)
        missing = requested - {p.name for p in sources}
        if missing: raise ValueError('Missing source files: ' + ', '.join(sorted(missing)))
        sources = [p for p in sources if p.name in requested]
    for source in sources:
        if (args.output_dir / source.name).exists():
            raise FileExistsError(args.output_dir / source.name)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.report_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for source in sources:
        t = time.monotonic(); dest = args.output_dir / source.name
        if dest.exists(): raise FileExistsError(dest)
        original = source.read_bytes(); source_hash = hashlib.sha256(original).hexdigest()
        data = gzip.decompress(original); header, fields = decode(data); n = header[2]
        xyz = coordinates(fields); rank, protected = priorities(fields, xyz)
        core = int(protected.sum()); rank[protected] = np.inf
        k = min(n, max(core, int(n * min(1, limit / len(original) * .98))))
        attempts = []
        temp = dest.with_suffix('.spz.tmp')
        for attempt in range(12):
            if k < core: raise ValueError('Budget too small to preserve occupied grid cells')
            selected = np.sort(np.argpartition(rank, n - k)[n - k:]) if k < n else np.arange(n)
            write_candidate(temp, data, fields, selected)
            size = temp.stat().st_size
            attempts.append(dict(splats=k, bytes=size))
            print(source.name, 'attempt', attempt + 1, 'splats', k, 'bytes', size, flush=True)
            if size <= limit: break
            next_k = max(core, min(k - 1, int(k * limit / size * .985)))
            if next_k == k: raise ValueError('Cannot meet budget')
            k = next_k
        else: raise RuntimeError('Budget search failed')
        check = gzip.decompress(temp.read_bytes()); out_header, out_fields = decode(check)
        assert out_header == (header[0], header[1], k, *header[3:])
        for before, after in zip(fields, out_fields):
            assert np.array_equal(before[selected], after), 'Retained attributes changed'
        assert np.all(np.isin(np.flatnonzero(protected), selected, assume_unique=True))
        assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
        assert size <= limit
        temp.rename(dest)
        np.save(args.report_dir / (source.stem + '_retained_indices.npy'), selected.astype(np.uint32))
        row = dict(file=source.name, source_bytes=len(original), output_bytes=size,
                   source_splats=n, output_splats=k, removed_percent=100*(1-k/n),
                   reduction_percent=100*(1-size/len(original)), protected_cells=core,
                   target_bytes=limit, sh_degree=0, source_sha256=source_hash,
                   output_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),
                   verification='PASS: gzip CRC, header, payload length, exact retained attributes, spatial cell coverage, unchanged original, size budget',
                   attempts=attempts, seconds=round(time.monotonic()-t, 2))
        rows.append(row)
        (args.report_dir/'metrics.json').write_text(json.dumps(rows, indent=2)+'\n')
        print('VERIFIED', json.dumps(row), flush=True)
    if not rows: raise ValueError('No source SPZ files found')

if __name__ == '__main__': main()
