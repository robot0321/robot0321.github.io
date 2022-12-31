
$(document).ready(function() {
    var editor = CodeMirror.fromTextArea(document.getElementById("bibtex"), {
        lineNumbers: false,
        lineWrapping: true,
        readOnly:true
    });
    $(function () {
        $('[data-toggle="tooltip"]').tooltip()
    });
    

// var frameNumber = 0, // start video at frame 0
//     // lower numbers = faster playback
//     playbackConst = 500, 
//     // get page height from video duration
//     setHeight = document.getElementById("main"), 
//     // select video element         
//     vid = document.getElementById('v0'); 
//     // var vid = $('#v0')[0]; // jquery option

    // $('ul.tabs li').click(function(){
    //     var tab_id = $(this).attr('data-tab');

    //     $('ul.tabs li').removeClass('current');
    //     $('.tab-content').removeClass('current');

    //     $(this).addClass('current');
    //     $("#"+tab_id).addClass('current');
    // })    

    $(function(){
        $('.tabcontent > div').hide();
        $('.tabnav a').click(function () {
          $('.tabcontent > div').hide().filter(this.hash).fadeIn();
          $('.tabnav a').removeClass('active');
          $(this).addClass('active');
          return false;
        }).filter(':eq(0)').click();
    });
// // Use requestAnimationFrame for smooth playback
// function scrollPlay(){  
//   var frameNumber  = window.pageYOffset/playbackConst;
//   vid.currentTime  = frameNumber;
//   window.requestAnimationFrame(scrollPlay);
// console.log('scroll');
// }
    
// // dynamically set the page height according to video length
// vid.addEventListener('loadedmetadata', function() {
//   setHeight.style.height = Math.floor(vid.duration) * playbackConst + "px";
// });
    
    
//     window.requestAnimationFrame(scrollPlay);
});
