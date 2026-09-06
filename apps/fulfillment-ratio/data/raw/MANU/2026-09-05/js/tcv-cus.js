$(document).ready(function(){
	$(".fulfillment-ratio .search-section").fadeIn();
	$("#selected-tcv1").val("");
	$("#selected-tcv2").val("");
	pageViewTrackTCV("Total Cash Value (TCV) ratio:Step1");
	$('html,body').animate({scrollTop: 0},0);

});

function pageViewTrackTCV(id){
	DataLayer.pageName=id;
	TrackPageView();
}

function eventTrackTCV(cat,type,label){
	window.adobeDataLayer.push({
		event: "customEvent",
		eventInfo: {
			event_category: cat,
			event_type: type,
			event_label: label,
		},
	});
	console.log("Data pushed to Adobe Data Layer:", window.adobeDataLayer);

	DataLayer.event_category=cat;
	DataLayer.event_type=type;
	DataLayer.event_label=label;
	TrackEvent();
}

function openDroplistTCV(id){
	$( ".drop-down" ).hide();
	$("#selection-tcv"+id).removeClass( "current" );

	if(id==1){
		 if($(".fulfillment-ratio").hasClass( "expand" )){
			  $(".fulfillment-ratio").removeClass( "expand" );
		  }else{
			  $(".fulfillment-ratio").addClass( "expand" );
		  }
	}
	 if($("#selection-tcv"+id).hasClass( "current" )){
		  $("#selection-tcv"+id).removeClass( "current" );
		  $( "#dropdown-tcv"+id ).hide();
	  }else{
		  $("#selection-tcv"+id).addClass( "current" );
		  $( "#dropdown-tcv"+id ).show();
	  }
	$(document).click(function(e) {
		var container = $(".selection");
		if (!container.is(e.target) && container.has(e.target).length === 0){
		   $(".drop-down").hide();
		  $(".selection").removeClass( "current" );
		  $(".fulfillment-ratio").removeClass( "expand" );
		}
	});
}

function selectedItemTCV(id,text,currency){
	$( "#resultTables-tcv" ).html("");
	$( "#dropdown-tcv"+id ).hide();
	$("#selection-tcv"+id).removeClass( "current" );
	$( "#selection-tcv"+id ).addClass( "active" );
	$( "#selectedText-tcv"+id+"b" ).html( text );
	$( "#selectedText-tcv"+id ).html( text );	
	$( ".cta-btn" ).removeClass( "hidden" );
	$(".fulfillment-ratio").removeClass( "expand" );
	if(id==1){
		if(currency!="no"){
			var string="";
			var placeholder="";
			for (let i = 0; i < currency.split("||").length; i++) {
				string=string+'<a class="item" href="javascript:void(0)" onclick="selectedItemTCV(\'2\',\''+currency.split("||")[i]+'\',\'null\')">'+currency.split("||")[i]+'</a>';
				if($("#lang").val()=="en"){
					if(i==0){
						placeholder=currency.split("||")[i];
					}else{
						placeholder=placeholder+' / '+currency.split("||")[i];
					}
				}else{
					if(i==0){
						placeholder=currency.split("||")[i];
					}else{
						placeholder=placeholder+'／'+currency.split("||")[i];
					}					
				}
			}
			$( "#selectedText-tcv2" ).html(placeholder);
			$( "#drop-down-list-currency-tcv" ).html(string);
			$( "#currencyBox-tcv" ).show();
			$( "#selection-tcv2" ).removeClass( "active" );
			$( "#box-tcv2" ).show();
			$( "#cta-btn-search-tcv" ).addClass( "error" );
			$("#cta-btn-search-tcv").attr("onclick","");

		}else{
			$( "#currencyBox-tcv" ).hide();
			$( "#cta-btn-search-tcv" ).removeClass( "error" );
			$("#cta-btn-search-tcv").attr("onclick","getResultTCV()");
		}
		
		$("#selected-tcv1").val(text);
		$("#selected-tcv2").val("");
		eventTrackTCV("body","dropdown","Step1:policy");
		//eventClick('Step1:policy');
		
		if(currency!="no"){
			selectedItemTCV('2',currency.split("||")[0],'null');
		}		
	}else if(id==2){
		$("#selected-tcv2").val(text);
		$( "#cta-btn-search-tcv" ).removeClass( "error" );
		$("#cta-btn-search-tcv").attr("onclick","getResultTCV()");
		eventTrackTCV("body","dropdown","Step1:currency");
		//eventClick('Step1:currency');
	}
}

function getResultTCV(){
	//resetAllResult();
	//eventClick('Step1:search');
	eventTrackTCV("body","button","Step1:search");

	$.ajax({
	method: "POST",
	url: "https://tools.manulife.com.hk/fulfillment-tcv-2024/html/ajax/ss1.php",
	data: { selected1:$("#selected-tcv1").val(),selected2:$("#selected-tcv2").val(),tablabel:"null",lang:$("#lang-tcv").val()}
	}).done(function(msg) {
		//alert(msg);
		$("#resultTables-tcv").html(msg);
		$('html,body').animate({scrollTop: jQuery(".resultContentStartTCV").offset().top-70},300);
	});	
}

function getProductDetailsTCV(p){
	//$(".result-section").fadeOut();
	//$(".terms-section").fadeOut();
	eventTrackTCV("body","tab","Result:policies effective");
	$.ajax({
	method: "POST",
	url: "https://tools.manulife.com.hk/fulfillment-tcv-2024/html/ajax/ss1.php",
	data: { selected1:$("#selected-tcv1").val(),selected2:$("#selected-tcv2").val(),tablabel:p,lang:$("#lang-tcv").val()}
	}).done(function(msg) {
		//alert(msg);
		$("#resultTables-tcv").html(msg);
		$('html,body').animate({scrollTop: jQuery(".resultContentStartTCV").offset().top-70},300);
	});	
}

function resetAllResultTCV(){
	$( ".result-section" ).hide();
	$( ".terms-section" ).hide();
	$( ".result-grid" ).hide();
	$( ".result-row" ).hide();
	$( ".result-dividend" ).hide();
	$( ".result-bonus" ).hide();
	$( ".footnote" ).hide();
}

function resetActionTCV(id){
	if(id==1){
		//eventClick('Step1:reset');
		eventTrackTCV("body","button","Step1:reset");
	}else{
		//eventClick('Result:search again');
		eventTrackTCV("body","button","Result:search again");
	}
	$("#selected-tcv1").val("");
	$("#selected-tcv2").val("");	
	$( "#resultTables-tcv" ).html("");
	$( "#selection-tcv1" ).removeClass( "active" );
	if($("#lang-tcv").val()=="en"){
		$( "#selectedText-tcv1" ).html("select a product");
		$( "#selectedText-tcv2" ).html("USD / non-HKD / non-USD / HKD");		
	}else{
		$( "#selectedText-tcv1" ).html("選擇產品");
		$( "#selectedText-tcv2" ).html("美元／非港元／非美元／港元");
	}
	$( "#selection-tcv2" ).removeClass( "active" );
	$( ".cta-btn" ).addClass( "error" );
	$("#cta-btn-search-tcv").attr("onclick","");

	//resetAllResult();
	$('html,body').animate({scrollTop: jQuery(".search-section").offset().top-70},300);
}
