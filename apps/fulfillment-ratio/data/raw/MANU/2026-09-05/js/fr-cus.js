$(document).ready(function(){
	$(".fulfillment-ratio .search-section").fadeIn();
	$("#selected1").val("");
	$("#selected2").val("");
	pageViewTrack("Fulfillment Ratio:Step1");
	$('html,body').animate({scrollTop: 0},0);

});

function pageViewTrack(id){
	DataLayer.pageName=id;
	TrackPageView();
}

function eventTrack(cat,type,label){
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

function openDroplist(id){
	$( ".drop-down" ).hide();
	$("#selection"+id).removeClass( "current" );

	if(id==1){
		 if($(".fulfillment-ratio").hasClass( "expand" )){
			  $(".fulfillment-ratio").removeClass( "expand" );
		  }else{
			  $(".fulfillment-ratio").addClass( "expand" );
		  }
	}
	 if($("#selection"+id).hasClass( "current" )){
		  $("#selection"+id).removeClass( "current" );
		  $( "#dropdown"+id ).hide();
	  }else{
		  $("#selection"+id).addClass( "current" );
		  $( "#dropdown"+id ).show();
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

function selectedItem(id,text,currency){
	$( "#resultTables" ).html("");
	$( "#dropdown"+id ).hide();
	$("#selection"+id).removeClass( "current" );
	$( "#selection"+id ).addClass( "active" );
	$( "#selectedText"+id+"b" ).html( text );
	$( "#selectedText"+id ).html( text );	
	$( ".cta-btn" ).removeClass( "hidden" );
	$(".fulfillment-ratio").removeClass( "expand" );
	if(id==1){
		if(currency!="no"){
			var string="";
			var placeholder="";
			for (let i = 0; i < currency.split("||").length; i++) {
				string=string+'<a class="item" href="javascript:void(0)" onclick="selectedItem(\'2\',\''+currency.split("||")[i]+'\',\'null\')">'+currency.split("||")[i]+'</a>';
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
			$( "#selectedText2" ).html(placeholder);
			$( "#drop-down-list-currency" ).html(string);
			$( "#currencyBox" ).show();
			$( "#selection2" ).removeClass( "active" );
			$( "#box2" ).show();
			$( "#cta-btn-search" ).addClass( "error" );
			$("#cta-btn-search").attr("onclick","");			
		}else{
			$( "#currencyBox" ).hide();
			$( "#cta-btn-search" ).removeClass( "error" );
			$("#cta-btn-search").attr("onclick","getResult()");
		}
		
		$("#selected1").val(text);
		$("#selected2").val("");
		eventTrack("body","dropdown","Step1:policy");
		//eventClick('Step1:policy');
		
		if(currency!="no"){
			selectedItem('2',currency.split("||")[0],'null');
		}
	}else if(id==2){
		$("#selected2").val(text);
		$( "#cta-btn-search" ).removeClass( "error" );
		$("#cta-btn-search").attr("onclick","getResult()");
		eventTrack("body","dropdown","Step1:currency");
		//eventClick('Step1:currency');
	}
}

function getResult(){
	//resetAllResult();
	//eventClick('Step1:search');
	eventTrack("body","button","Step1:search");

	$.ajax({
	method: "POST",
	url: "https://tools.manulife.com.hk/fulfillment-ratio-2024/html/ajax/ss1.php",
	data: { selected1:$("#selected1").val(),selected2:$("#selected2").val(),tablabel:"null",lang:$("#lang").val()}
	}).done(function(msg) {
		//alert(msg);
		$("#resultTables").html(msg);
		$('html,body').animate({scrollTop: jQuery(".resultContentStart").offset().top-70},300);
	});	
}

function getProductDetails(p){
	//$(".result-section").fadeOut();
	//$(".terms-section").fadeOut();
	eventTrack("body","tab","Result:policies effective");
	$.ajax({
	method: "POST",
	url: "https://tools.manulife.com.hk/fulfillment-ratio-2024/html/ajax/ss1.php",
	data: { selected1:$("#selected1").val(),selected2:$("#selected2").val(),tablabel:p,lang:$("#lang").val()}
	}).done(function(msg) {
		//alert(msg);
		$("#resultTables").html(msg);
		$('html,body').animate({scrollTop: jQuery(".resultContentStart").offset().top-70},300);
	});	
}

function resetAllResult(){
	$( ".result-section" ).hide();
	$( ".terms-section" ).hide();
	$( ".result-grid" ).hide();
	$( ".result-row" ).hide();
	$( ".result-dividend" ).hide();
	$( ".result-bonus" ).hide();
	$( ".footnote" ).hide();
}

function resetAction(id){
	if(id==1){
		//eventClick('Step1:reset');
		eventTrack("body","button","Step1:reset");
	}else{
		//eventClick('Result:search again');
		eventTrack("body","button","Result:search again");
	}
	$("#selected1").val("");
	$("#selected2").val("");	
	$( "#resultTables" ).html("");
	$( "#selection1" ).removeClass( "active" );
	if($("#lang").val()=="en"){
		$( "#selectedText1" ).html("select a product");
		$( "#selectedText2" ).html("USD / non-USD / HKD");		
	}else{
		$( "#selectedText1" ).html("選擇產品");
		$( "#selectedText2" ).html("美元／非美元／港元");
	}
	$( "#selection2" ).removeClass( "active" );
	$( ".cta-btn" ).addClass( "error" );
	$("#cta-btn-search").attr("onclick","");

	//resetAllResult();
	$('html,body').animate({scrollTop: jQuery(".search-section").offset().top-70},300);
}

function checkTable(product,currency,policy,inputdate){

	var currentdate = new Date();
	//var currentdate_dd = String(currentdate.getDate()).padStart(2, '0');
	//var currentdate_mm = String(currentdate.getMonth() + 1).padStart(2, '0'); //January is 0!
	//var currentdate_yyyy = currentdate.getFullYear();
	//var d4=new Date(currentdate_yyyy,currentdate_mm,currentdate_dd);
	var d1 = "";
	var i;
	var ii=0;
	var result_table_id="";
	var isPass=0;
	var s=0;
	
	if(policy=="have"){
		d1 = inputdate;	
	}else{
		d1 = currentdate.getFullYear();
		//d1="today";
	}
	if(policy=="have" && inputdate>=currentdate.getFullYear()){
		s=1;
	}else{
		for (i = 0; i < tdata.length; i++) {
		  if(tdata[i][0]==product && (tdata[i][2]==currency || currency=="")){
			  if(tdata[i][3]=="past"){
				isPass=1;		  
			  }else{
				var d2= tdata[i][3];
			  }
			  if(tdata[i][4]=="today"){
				var d3=currentdate.getFullYear();
			  }else{
				var d3= tdata[i][4];
			  }

			  if((isPass==1 || d1>=d2) && d1<=d3){
			
				//special handlling for product vita, when search with the policy "do not have", matched "today" and show error message4 instead of showing result.
				if(tdata[i][0]=="vita" && policy!="have"){
					s=1;
				}else{ 
					if(tdata[i][1]=="annual-dividend"){
						$( "#"+product+" #annual-dividend" ).show();
						$( "#"+product+" #dividend" ).html(dividend_note);
						$( "#"+product+" #dividend" ).show();
					}else if(tdata[i][1]=="terminal-bonus"){
						$( "#"+product+" #terminal-bonus" ).show();
						$( "#"+product+" #bonus" ).html(bonus_note);
						$( "#"+product+" #bonus" ).show();
					}
					
					$( "#"+product+" #"+tdata[i][1] ).show();
					$( "#"+product+" #"+tdata[i][5] ).show();

					if(tdata[i][7]!=""){
						$( "#"+product+" #"+tdata[i][7] ).show();
					}

					if(tdata[i][6]=="A"){
						$( ".terms-section.section1" ).show();
					}else if(tdata[i][6]=="B"){
						$( ".terms-section.section2" ).show();
					}else if(tdata[i][6]=="C"){
						$( ".terms-section.section1" ).show();
						$( ".terms-section.section2" ).show();
					}
					ii=1;

					$('html,body').animate({scrollTop: jQuery(".resultContentStart").offset().top},300);
				}
			  }
		  }
		}
	}

	if(ii==0){
		if(s==1){
			$( "#error4" ).show();
			$( "#error3" ).hide();
			$( "#error2" ).hide();
		}else if(policy=="have"){
			$( "#error4" ).hide();
			$( "#error3" ).hide();
			$( "#error2" ).show();
		}else{
			$( "#error4" ).hide();
			$( "#error2" ).hide();
			$( "#error3" ).show();
		}
		$( ".cta-btn" ).addClass( "error" );
		$( ".result-section" ).hide();
		$( ".terms-section" ).addClass( "hidden" );
		//$( ".cta-btn" ).addClass( "hidden" );
	}else{
		$( "#error2" ).hide();
		$( "#error3" ).hide();
		$( "#error4" ).hide();
	}
}
//checkTable("ManuFuture Education Plan1","HKD","30/07/2019");



