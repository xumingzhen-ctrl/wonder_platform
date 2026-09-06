$(document).ready(function(){
	$("#body-content").fadeIn();
	$('html,body').animate({scrollTop: 0},0);
});


$(document).ready(function(){
	$('#tab02-content').hide();
	$('#tab01-content').hide();

	$('#tab01').click(function(){
		
		eventTrack("body","button","Total Cash Value (TCV) ratio");
		$('#tab02-content').hide();
		$('#tab01-content').fadeIn();
		$('html,body').animate({scrollTop: jQuery("#tab01-content").offset().top-180},300);
		$(this).children().addClass('active');
		$(this).siblings().children().removeClass('active');
    });
	$('#tab02').click(function(){
		eventTrack("body","dropdown","Fulfillment ratio");
		$('#tab01-content').hide();
		$('#tab02-content').fadeIn();
		$('html,body').animate({scrollTop: jQuery("#tab02-content").offset().top-180},300);
		$(this).children().addClass('active');
		$(this).siblings().children().removeClass('active');
    });
});