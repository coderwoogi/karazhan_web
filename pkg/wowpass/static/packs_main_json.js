var legendary;
var packselected;

var legendary_prob = 9;
var epic_prob = 48;
var rare_prob = 58;
var common_prob = 885;

//10
//45
//35
//910


var common = [],
	rare = [],
	epic = [],
	legendary = [];

function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}
var lang = getCookie('language');
if (getCookie('language') == "") { var lang = "en"; }


$(function () {

	var deck_open = document.getElementById('deck_open_sequence');

	$('div.basicLinked').slider().linkedSliders({total: 1000});
$( "div.basicLinked" ).slider( "option", "max", 1000 );



	$('div.basicLinked').bind('slidechange', function(event, ui) {
		var result = '';
		var total = 0;
		$('div.basicLinked').each(function(i) {
			var value = $(this).slider('value');
if (i == "0") { legendary_prob = value; }
if (i == "1") { epic_prob = value; }
if (i == "2") { rare_prob = value; }
if (i == "3") { common_prob = value; }
$('#c'+i).text(value/10);

		});
		$('#defaultPercentages').text('Legendary:' + legendary + 'Epic:' + epic + 'Rare:' + rare + 'Common:' + common);
	}).filter(':first').slider('value', 1000);




        $("#cback").click(
            function () {
var cbackid = $("#cback input[type='radio']:checked").val();
$('div.back img').attr('src', 'images/card_back' + cbackid + '.png');

//if (cbackid == "0" || cbackid == "3"  || cbackid == "4" || cbackid == "6") {
//$('#deck_open_sequence').attr('src', 'video/deck_open_sequence_' + cbackid + '.mp4');
//}

}
        );

        $("#defaultdrop").click(
            function () {


	$('div.basicLinked').slider().linkedSliders().eq(0).slider('value', 9);
	$('div.basicLinked').slider().linkedSliders().eq(1).slider('value', 48);
	$('div.basicLinked').slider().linkedSliders().eq(2).slider('value', 58);
	$('div.basicLinked').slider().linkedSliders().eq(3).slider('value', 885);

			$('#pack').css('background', 'url("images/pack.png"), no-repeat');
            }            
        );

        $("#insanedrop").click(
            function () {
	$('div.basicLinked').slider().linkedSliders().eq(0).slider('value', 400);
	$('div.basicLinked').slider().linkedSliders().eq(1).slider('value', 300);
	$('div.basicLinked').slider().linkedSliders().eq(2).slider('value', 200);
	$('div.basicLinked').slider().linkedSliders().eq(3).slider('value', 100);

			$('#pack').css('background', 'url("images/pack-site.png"), no-repeat');
				var enrage = new Audio();
				enrage.src = "sounds/enrage.ogg";
				enrage.volume = 0.3;
				enrage.play();

            }            
        );

        $("#hide").click(
            function () {
			$('#options').stop(true, true).fadeOut(550);
			$('#blured').stop(true, true).fadeOut(550);
			$('#packtgt').fadeIn(550);
			$('#packgvg').fadeIn(550);
			$('#packwotog').fadeIn(550);
			$('#packmsog').fadeIn(550);
			$('#packungoro').fadeIn(550);
			$('#packkotft').fadeIn(550);
			$('#packshadows').fadeIn(550);
			$('#pack').fadeIn(550);
            }            
        );

	$('div.basicLinked').slider().linkedSliders().eq(0).slider('value', 9);
	$('div.basicLinked').slider().linkedSliders().eq(1).slider('value', 48);
	$('div.basicLinked').slider().linkedSliders().eq(2).slider('value', 58);
	$('div.basicLinked').slider().linkedSliders().eq(3).slider('value', 885);

});







function getCards(set) {
if ($('.inverse').is(":checked"))
{
var istate = 1;
} else {
var istate = 0;
}

$.ajax({

  dataType: 'text',
  url: set + '.json',
  success: function(jsondata){

var common = [],
	rare = [],
	epic = [],
	legendary = [];

var common_class = [],
	rare_class = [],
	epic_class = [],
	legendary_class = [];

var end_result = [];
var end_result_class = [];

				var jsondata = $.parseJSON(jsondata);
				$.each(jsondata, function(i, cards) {



						if (cards.rarity == '1') {
var tarr = new Array(cards.cardid, cards.class, cards.rarity, '0');
							common.push(tarr);
						}
						else if (cards.rarity == '3') {
var tarr = new Array(cards.cardid, cards.class, cards.rarity, '0');
							rare.push(tarr);
			
						}
						else if (cards.rarity == '4') {
var tarr = new Array(cards.cardid, cards.class, cards.rarity, '0');
							epic.push(tarr);
			
						}
						else if (cards.rarity == '5') {
var tarr = new Array(cards.cardid, cards.class, cards.rarity, '0');
							legendary.push(tarr);
						}

});

//temp fix


//Card1
if (packsOpenedWithoutLegendary == 20) { var rand = Math.floor((Math.random() * 5) + 1); } else { var rand = Math.floor((Math.random() * 1000) + 1); }
if (rand >= 1 && rand <= legendary_prob) {
var item = legendary[Math.floor(Math.random()*legendary.length)];
var randgold = Math.floor((Math.random() * 100) + 1);   if (randgold > 0 && randgold <= 2) { item[3] = '1'; }
end_result.push(item);
} else if (rand > legendary_prob && rand <= legendary_prob+epic_prob) {
var item = epic[Math.floor(Math.random()*epic.length)];
var randgold = Math.floor((Math.random() * 100) + 1);   if (randgold > 0 && randgold <= 2) { item[3] = '1'; }
end_result.push(item);
} else if (rand > legendary_prob+epic_prob && rand <= legendary_prob+epic_prob+rare_prob) {
var item = rare[Math.floor(Math.random()*rare.length)];
var randgold = Math.floor((Math.random() * 100) + 1);   if (randgold > 0 && randgold <= 2) { item[3] = '1'; }
end_result.push(item);
} else if (rand > legendary_prob+epic_prob+rare_prob && rand <= legendary_prob+epic_prob+rare_prob+common_prob) {
var item = rare[Math.floor(Math.random()*rare.length)];
var randgold = Math.floor((Math.random() * 100) + 1);   if (randgold > 0 && randgold <= 3) { item[3] = '1'; }
end_result.push(item);
}
for (i = 0; i < 4; i++) {

var rand = Math.floor((Math.random() * 1000) + 1);  
if (rand >= 1 && rand <= legendary_prob) {

var item = legendary[Math.floor(Math.random()*legendary.length)];
var randgold = Math.floor((Math.random() * 100) + 1);   if (randgold > 0 && randgold <= 2) { item[3] = '1'; }
end_result.push(item);

} else if (rand >= legendary_prob && rand <= legendary_prob+epic_prob) {

var item = epic[Math.floor(Math.random()*epic.length)];
var randgold = Math.floor((Math.random() * 100) + 1);   if (randgold > 0 && randgold <= 2) { item[3] = '1'; }
end_result.push(item);

} else if (rand >= legendary_prob+epic_prob && rand <= legendary_prob+epic_prob+rare_prob) {

var item = rare[Math.floor(Math.random()*rare.length)];
var randgold = Math.floor((Math.random() * 100) + 1);   if (randgold > 0 && randgold <= 2) { item[3] = '1'; }
end_result.push(item);

} else if (rand >= legendary_prob+epic_prob+rare_prob && rand <= legendary_prob+epic_prob+rare_prob+common_prob) {

var item = common[Math.floor(Math.random()*common.length)];
var randgold = Math.floor((Math.random() * 100) + 1);   if (randgold > 0 && randgold <= 3) { item[3] = '1'; }
end_result.push(item);

}

}


function shuffle(o){
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
}

shuffle(end_result);
console.log(end_result);

	$('.cards').each(function(i) {


if (set == "7") {
		$('div.front img', this).css('position', 'relative');
		$('div.front img', this).css('top', '10px');
if (end_result[i][3] == "1") {
//		$('div.front img', this).attr('src', 'http://www.hearthstonedb.net/images/enus/premium/' + end_result[i][0] + '_premium.gif');
		$('div.front img', this).attr('src', 'https://art.hearthstonejson.com/v1/render/latest/enUS/256x/' + end_result[i][0] + '.png');
} else {
		$('div.front img', this).attr('src', 'https://art.hearthstonejson.com/v1/render/latest/enUS/256x/' + end_result[i][0] + '.png');
}
} else {
		$('div.front img', this).css('position', 'relative');
		$('div.front img', this).css('top', '0px');
if (end_result[i][3] == "1") {
//		$('div.front img', this).attr('src', 'http://media.services.zam.com/v1/media/byName/hs/cards/enus/animated/' + end_result[i][0] + '_premium.gif');
		$('div.front img', this).attr('src', 'https://art.hearthstonejson.com/v1/render/latest/enUS/256x/' + end_result[i][0] + '.png');
} else {
		$('div.front img', this).attr('src', 'https://art.hearthstonejson.com/v1/render/latest/enUS/256x/' + end_result[i][0] + '.png');
}
}




		$(this).attr('rarity', end_result[i][2]);
		$(this).attr('golden', end_result[i][3]);
        $('div.cclass', this).css('background-image', 'url(images/' + end_result[i][1] + '.png)');

	});




















			}
		});


};



				var music = new Audio();
				music.src = "sounds/backgroundmusic.ogg";
				music.volume = 0.1;
				music.play();

music.addEventListener('ended', function() {
    this.currentTime = 0;
    this.play();
}, false);

var packsBought = 999;
var packsOpened = 0;
var packsOpenedWithoutLegendary = 0;

  $(function() {


    $('#shop').click(function(e) {  
			$('#pack').fadeOut(500);
			$('#packgvg').fadeOut(500);
			$('#packtgt').fadeOut(500);
			$('#packwotog').fadeOut(500);
			$('#packmsog').fadeOut(500);
			$('#packungoro').fadeOut(500);
			$('#packkotft').fadeOut(500);
			$('#packshadows').fadeOut(500);
			$('#options').fadeIn(500);
			$('#blured').fadeIn(500);
				$(this).css({ 'background': 'url("")' });
    });

	$('#shop').mouseenter(function() {

				$(this).css({ 'background': 'url("images/shop-light.png")' });
		var shop = new Audio();
		shop.src = "sounds/shop_hover.ogg";
		shop.volume = 1;
		shop.play();
	});


    $('#shop').mouseleave(function(){	

				$(this).css({ 'background': 'url("")' });
	});



$('#packsbought').text(packsBought);

$('#packsopened').text(packsOpened);


$(".inverse").change(function() {
    if(this.checked) {
			$('#pack').css('background', 'url("images/pack-site.png"), no-repeat');
				var enrage = new Audio();
				enrage.src = "sounds/enrage.ogg";
				enrage.volume = 0.3;
				enrage.play();
    } else {
			$('#pack').css('background', 'url("images/pack.png"), no-repeat');
}
});


getCards();

	$('#donebutton').mousedown(function() {

			$('#donebutton').stop(true, true).fadeOut(550);
cardsflipped = 0;




			$('.cards').fadeOut(850, function() {
				this.flipped = 0;

  $('.cards').css({
     marginTop:'0px',
     marginLeft:'0px'
  });


			});


				$('#blured').fadeOut(550);


			$('#deck_open_sequence').fadeOut(1, function() {
				deck_open.pause();
				deck_open.currentTime = 0;
			});




if (packsBought != 0) {
$('#pack').draggable("enable").fadeIn(850);
$('#packgvg').draggable("enable").fadeIn(850);
$('#packtgt').draggable("enable").fadeIn(850);
$('#packwotog').draggable("enable").fadeIn(850);
$('#packmsog').draggable("enable").fadeIn(850);
$('#packungoro').draggable("enable").fadeIn(850);
$('#packkotft').draggable("enable").fadeIn(850);
$('#packshadows').draggable("enable").fadeIn(850);
 }
				

				music.volume = 0.2;


});

	$(document).mousedown(function(e) {
		if ($(e.target).is('#pack')) { packselected = "vanilla"; } if ($(e.target).is('#packgvg')) { packselected = "gvg"; } if ($(e.target).is('#packtgt')) { packselected = "tgt"; } if ($(e.target).is('#packwotog')) { packselected = "wotog"; } if ($(e.target).is('#packmsog')) { packselected = "msog"; } if ($(e.target).is('#packungoro')) { packselected = "ungoro"; } if ($(e.target).is('#packkotft')) { packselected = "kotft"; } if ($(e.target).is('#packshadows')) { packselected = "shadows"; }
//		if ($(e.target).is('#pack')) { packselected = "vanilla"; $('#deck_open_sequence').attr('src', 'video/deck_open_sequence_0.mp4'); } if ($(e.target).is('#packgvg')) { packselected = "gvg";  } if ($(e.target).is('#packtgt')) { packselected = "tgt"; $('#deck_open_sequence').attr('src', 'video/deck_open_sequence_tgt.mp4'); } if ($(e.target).is('#packwotog')) { packselected = "wotog"; $('#deck_open_sequence').attr('src', 'video/deck_open_sequence_0.mp4'); }

		if ($(e.target).is('#pack')) {

			$('#pack').css('cursor', 'url("images/cursor-grab.png"), auto');
		} else { 
			$('#wrapper').css('cursor', 'url("images/cursor-down.png"), auto');
		}
	}).mouseup(function() {

		$('#wrapper').css('cursor', 'url("images/cursor-point.png"), auto');
			$('#pack').css('cursor', 'url("images/cursor-point.png"), auto');
	});

	$('#hole').droppable({
		tolerance: "touch",
		drop: function(e, ui) {

		if (packselected == "vanilla") { 

getCards("0"); packDrop("vanilla");


 } if (packselected == "gvg") { 

getCards("1"); packDrop("gvg");


 } if (packselected == "tgt") { 

getCards("2"); packDrop("tgt");

 } if (packselected == "wotog") { 

getCards("3"); packDrop("wotog");

 } if (packselected == "msog") { 

getCards("4"); packDrop("msog");

 } if (packselected == "ungoro") { 

getCards("5"); packDrop("ungoro");

 } if (packselected == "kotft") { 

getCards("6"); packDrop("kotft");

 } if (packselected == "shadows") { 

getCards("7"); packDrop("shadows");

 }
			
		}
	});






	function packDrop(set) {

packsBought = packsBought - 1;
$('#packsbought').text(packsBought);

packsOpened = packsOpened + 1;
packsOpenedWithoutLegendary = packsOpenedWithoutLegendary + 1;

$('#packsopened').text(packsOpened);

				var deckplace = new Audio();
				deckplace.src = "sounds/deck_place.ogg";
				deckplace.volume = 0.1;
				deckplace.play();

// Move pack to hole
if (set == "vanilla") {

			$('#pack').css({
				'left': '730px',
				'top': '267px',
				'transform': 'perspective(0) rotateY(0)',
				'-webkit-transform': 'perspective(0) rotateY(0)'
			});

}
if (set == "gvg") {

			$('#packgvg').css({
				'left': '730px',
				'top': '267px',
				'transform': 'perspective(0) rotateY(0)',
				'-webkit-transform': 'perspective(0) rotateY(0)'
			});

}

if (set == "tgt") {

			$('#packtgt').css({
				'left': '730px',
				'top': '267px',
				'transform': 'perspective(0) rotateY(0)',
				'-webkit-transform': 'perspective(0) rotateY(0)'
			});

}

if (set == "wotog") {

			$('#packwotog').css({
				'left': '730px',
				'top': '267px',
				'transform': 'perspective(0) rotateY(0)',
				'-webkit-transform': 'perspective(0) rotateY(0)'
			});

}

if (set == "msog") {

			$('#packmsog').css({
				'left': '730px',
				'top': '267px',
				'transform': 'perspective(0) rotateY(0)',
				'-webkit-transform': 'perspective(0) rotateY(0)'
			});

}

if (set == "ungoro") {

			$('#packungoro').css({
				'left': '730px',
				'top': '267px',
				'transform': 'perspective(0) rotateY(0)',
				'-webkit-transform': 'perspective(0) rotateY(0)'
			});

}

if (set == "ungoro") {

			$('#packkotft').css({
				'left': '730px',
				'top': '267px',
				'transform': 'perspective(0) rotateY(0)',
				'-webkit-transform': 'perspective(0) rotateY(0)'
			});

}

if (set == "shadows") {

			$('#packshadows').css({
				'left': '730px',
				'top': '267px',
				'transform': 'perspective(0) rotateY(0)',
				'-webkit-transform': 'perspective(0) rotateY(0)'
			});

}
				music.volume = 0.03;
// Blur the BG

				$('#blured').fadeIn(350);

// 
				$('#deck_open_sequence').fadeIn(350);
			$('#deck_open_sequence').css('z-index', '5').show;
			deck_open.volume = 0.8;
			deck_open.play();






			$('#pack').fadeOut(350);
			$('#packgvg').fadeOut(350);
			$('#packtgt').fadeOut(350);
			$('#packwotog').fadeOut(350);
			$('#packmsog').fadeOut(350);
			$('#packungoro').fadeOut(350);
			$('#packkotft').fadeOut(350);
			$('#packshadows').fadeOut(350);

			//	$('#deck_open_sequence').delay(3250).fadeOut(250);

//if (set == "tgt") { 
//				$('.cards, .cards img').delay(4350).fadeIn(250);
//} else {
//				$('.cards, .cards img').delay(3150).fadeIn(250);
//}
				$('.cards, .cards img').delay(3150).fadeIn(250);





	};




    $( "#pack" ).draggable({
		containment: "#wrapper",
		scroll: false,
		revert: true,

    // Find original position of dragged image.
    start: function(event, ui) {

    	// Show start dragged position of image.
    	var Startpos = $(this).position();

				$('.cards').css({
					'transform': 'rotateY(0deg)',
					'-webkit-transform': 'rotateY(0deg)'
				});

			$('#circleglow').fadeIn(750);

var glow_sequence = document.getElementById('glow_sequence');

			glow_sequence.volume = 0.8;
			glow_sequence.play();



			$("#pack").css({
					'transform': 'scale(1.10) perspective(300px) rotateY(5deg)',
					'-webkit-transform': 'scale(1.10) perspective(300px) rotateY(5deg)'
			});
audioElement_pack_lift.play();
    },

    // Find position where image is dropped.
    stop: function(event, ui) {

    	// Show dropped position.
    	var Stoppos = $(this).position();

			$("#pack").css({
				'transform': 'scale(1.0)',
				'-webkit-transform': 'scale(1.0)'
			});
				$('#circleglow').fadeOut(50);
			glow_sequence.pause();

    }

});





// pls

    $("#packgvg" ).draggable({
		containment: "#wrapper",
		scroll: false,
		revert: true,

    // Find original position of dragged image.
    start: function(event, ui) {

    	// Show start dragged position of image.
    	var Startpos = $(this).position();

				$('.cards').css({
					'transform': 'rotateY(0deg)',
					'-webkit-transform': 'rotateY(0deg)'
				});

			$('#circleglow').fadeIn(750);

var glow_sequence = document.getElementById('glow_sequence');

			glow_sequence.volume = 0.8;
			glow_sequence.play();



			$("#packgvg").css({
					'transform': 'scale(1.10) perspective(300px) rotateY(5deg)',
					'-webkit-transform': 'scale(1.10) perspective(300px) rotateY(5deg)'
			});
audioElement_pack_lift.play();
    },

    // Find position where image is dropped.
    stop: function(event, ui) {

    	// Show dropped position.
    	var Stoppos = $(this).position();

			$("#packgvg").css({
				'transform': 'scale(1.0)',
				'-webkit-transform': 'scale(1.0)'
			});
				$('#circleglow').fadeOut(50);
			glow_sequence.pause();

    }

});




// pls

    $("#packtgt" ).draggable({
		containment: "#wrapper",
		scroll: false,
		revert: true,

    // Find original position of dragged image.
    start: function(event, ui) {

    	// Show start dragged position of image.
    	var Startpos = $(this).position();

				$('.cards').css({
					'transform': 'rotateY(0deg)',
					'-webkit-transform': 'rotateY(0deg)'
				});

			$('#circleglow').fadeIn(750);

var glow_sequence = document.getElementById('glow_sequence');

			glow_sequence.volume = 0.8;
			glow_sequence.play();



			$("#packtgt").css({
					'transform': 'scale(1.10) perspective(300px) rotateY(5deg)',
					'-webkit-transform': 'scale(1.10) perspective(300px) rotateY(5deg)'
			});
audioElement_pack_lift.play();
    },

    // Find position where image is dropped.
    stop: function(event, ui) {

    	// Show dropped position.
    	var Stoppos = $(this).position();

			$("#packtgt").css({
				'transform': 'scale(1.0)',
				'-webkit-transform': 'scale(1.0)'
			});
				$('#circleglow').fadeOut(50);
			glow_sequence.pause();

    }

});

// pls

    $("#packwotog" ).draggable({
		containment: "#wrapper",
		scroll: false,
		revert: true,

    // Find original position of dragged image.
    start: function(event, ui) {

    	// Show start dragged position of image.
    	var Startpos = $(this).position();

				$('.cards').css({
					'transform': 'rotateY(0deg)',
					'-webkit-transform': 'rotateY(0deg)'
				});

			$('#circleglow').fadeIn(750);

var glow_sequence = document.getElementById('glow_sequence');

			glow_sequence.volume = 0.8;
			glow_sequence.play();



			$("#packwotog").css({
					'transform': 'scale(1.10) perspective(300px) rotateY(5deg)',
					'-webkit-transform': 'scale(1.10) perspective(300px) rotateY(5deg)'
			});
audioElement_pack_lift.play();
    },

    // Find position where image is dropped.
    stop: function(event, ui) {

    	// Show dropped position.
    	var Stoppos = $(this).position();

			$("#packwotog").css({
				'transform': 'scale(1.0)',
				'-webkit-transform': 'scale(1.0)'
			});
				$('#circleglow').fadeOut(50);
			glow_sequence.pause();

    }

});

// pls

    $("#packmsog" ).draggable({
		containment: "#wrapper",
		scroll: false,
		revert: true,

    // Find original position of dragged image.
    start: function(event, ui) {

    	// Show start dragged position of image.
    	var Startpos = $(this).position();

				$('.cards').css({
					'transform': 'rotateY(0deg)',
					'-webkit-transform': 'rotateY(0deg)'
				});

			$('#circleglow').fadeIn(750);

var glow_sequence = document.getElementById('glow_sequence');

			glow_sequence.volume = 0.8;
			glow_sequence.play();



			$("#packmsog").css({
					'transform': 'scale(1.10) perspective(300px) rotateY(5deg)',
					'-webkit-transform': 'scale(1.10) perspective(300px) rotateY(5deg)'
			});
audioElement_pack_lift.play();
    },

    // Find position where image is dropped.
    stop: function(event, ui) {

    	// Show dropped position.
    	var Stoppos = $(this).position();

			$("#packmsog").css({
				'transform': 'scale(1.0)',
				'-webkit-transform': 'scale(1.0)'
			});
				$('#circleglow').fadeOut(50);
			glow_sequence.pause();

    }

});


// pls

    $("#packungoro" ).draggable({
		containment: "#wrapper",
		scroll: false,
		revert: true,

    // Find original position of dragged image.
    start: function(event, ui) {

    	// Show start dragged position of image.
    	var Startpos = $(this).position();

				$('.cards').css({
					'transform': 'rotateY(0deg)',
					'-webkit-transform': 'rotateY(0deg)'
				});

			$('#circleglow').fadeIn(750);

var glow_sequence = document.getElementById('glow_sequence');

			glow_sequence.volume = 0.8;
			glow_sequence.play();



			$("#packungoro").css({
					'transform': 'scale(1.10) perspective(300px) rotateY(5deg)',
					'-webkit-transform': 'scale(1.10) perspective(300px) rotateY(5deg)'
			});
audioElement_pack_lift.play();
    },

    // Find position where image is dropped.
    stop: function(event, ui) {

    	// Show dropped position.
    	var Stoppos = $(this).position();

			$("#packungoro").css({
				'transform': 'scale(1.0)',
				'-webkit-transform': 'scale(1.0)'
			});
				$('#circleglow').fadeOut(50);
			glow_sequence.pause();

    }

});

// pls

    $("#packkotft" ).draggable({
		containment: "#wrapper",
		scroll: false,
		revert: true,

    // Find original position of dragged image.
    start: function(event, ui) {

    	// Show start dragged position of image.
    	var Startpos = $(this).position();

				$('.cards').css({
					'transform': 'rotateY(0deg)',
					'-webkit-transform': 'rotateY(0deg)'
				});

			$('#circleglow').fadeIn(750);

var glow_sequence = document.getElementById('glow_sequence');

			glow_sequence.volume = 0.8;
			glow_sequence.play();



			$("#packkotft").css({
					'transform': 'scale(1.10) perspective(300px) rotateY(5deg)',
					'-webkit-transform': 'scale(1.10) perspective(300px) rotateY(5deg)'
			});
audioElement_pack_lift.play();
    },

    // Find position where image is dropped.
    stop: function(event, ui) {

    	// Show dropped position.
    	var Stoppos = $(this).position();

			$("#packkotft").css({
				'transform': 'scale(1.0)',
				'-webkit-transform': 'scale(1.0)'
			});
				$('#circleglow').fadeOut(50);
			glow_sequence.pause();

    }

});

// pls

    $("#packshadows" ).draggable({
		containment: "#wrapper",
		scroll: false,
		revert: true,

    // Find original position of dragged image.
    start: function(event, ui) {

    	// Show start dragged position of image.
    	var Startpos = $(this).position();

				$('.cards').css({
					'transform': 'rotateY(0deg)',
					'-webkit-transform': 'rotateY(0deg)'
				});

			$('#circleglow').fadeIn(750);

var glow_sequence = document.getElementById('glow_sequence');

			glow_sequence.volume = 0.8;
			glow_sequence.play();



			$("#packshadows").css({
					'transform': 'scale(1.10) perspective(300px) rotateY(5deg)',
					'-webkit-transform': 'scale(1.10) perspective(300px) rotateY(5deg)'
			});
audioElement_pack_lift.play();
    },

    // Find position where image is dropped.
    stop: function(event, ui) {

    	// Show dropped position.
    	var Stoppos = $(this).position();

			$("#packshadows").css({
				'transform': 'scale(1.0)',
				'-webkit-transform': 'scale(1.0)'
			});
				$('#circleglow').fadeOut(50);
			glow_sequence.pause();

    }

});



$('#o5').text('0');
$('#o4').text('0');
$('#o3').text('0');
$('#o1').text('0');

var cardsflipped = 0;

	$('.cards').each(function(i) {

		//When that element (card) is clicked...
		$(this).unbind('mousedown').mousedown(function() {
if (!this.flipped) {
cardsflipped++;
}

if (cardsflipped == "5") {
				$('#donebutton').delay(350).fadeIn(550);

}




if (!this.flipped) {
var rrr = $(this).attr('rarity');
var rff = $('#o'+rrr).text();
var x = parseInt(rff,10);
x = x+1;
$('#o'+rrr).text(x);

				if ($(this).attr('rarity') == "5") {
packsOpenedWithoutLegendary = 0;
}

				if ($(this).attr('rarity') == "5") {
					var osound = "sounds/lang/card_turn_over_legendary.ogg";
				}
				if ($(this).attr('rarity') == "4") {
					var osound = "sounds/card_turn_over_epic.ogg";
				}
				if ($(this).attr('rarity') == "3") {
					var osound = "sounds/card_turn_over_rare.ogg";
				}
				if ($(this).attr('rarity') == "1") {
					var osound = "sounds/card_turn_over_normal.ogg";
				}

				//Play the appropriate announcer quote based on the card's rarity
				var opensound = new Audio();
				opensound.src = osound;
				opensound.volume = 0.07;
				opensound.play();



				if ($(this).attr('rarity') == "5") {
if($(this).attr('golden') >= "1") {
					var sound = "sounds/en/VO_ANNOUNCER_FOIL_L_32.ogg";
} else {
					var sound = "sounds/en/VO_ANNOUNCER_LEGENDARY_25.ogg";
}
				}
				if ($(this).attr('rarity') == "4") {
if($(this).attr('golden') >= "1") {
					var sound = "sounds/en/VO_ANNOUNCER_FOIL_E_31.ogg";
} else {
					var sound = "sounds/en/VO_ANNOUNCER_EPIC_26.ogg";
}
				}
				if ($(this).attr('rarity') == "3") {
if($(this).attr('golden') >= "1") {
					var sound = "sounds/en/VO_ANNOUNCER_FOIL_R_30.ogg";
} else {
					var sound = "sounds/en/VO_ANNOUNCER_RARE_27.ogg";
}
				}
				if ($(this).attr('rarity') == "1") {
if($(this).attr('golden') >= "1") {
					var sound = "sounds/en/VO_ANNOUNCER_FOIL_C_29.ogg";
} else {
					var sound = "";
}
				}

				//Play the appropriate announcer quote based on the card's rarity
				var announcer = new Audio();
				announcer.src = sound;
				announcer.volume = 0.3;
				announcer.play();

}









// alert($(this).attr('id'));

var cardidthis = $(this).attr('id');

if (cardidthis == "card1") {
  $(this).animate({
     marginTop:'-30px',
     marginLeft:'10px'
  },'fast');
} else if (cardidthis == "card2") {
  $(this).animate({
     marginTop:'-15px',
     marginLeft:'-25px'
  },'fast');
} else if (cardidthis == "card3") {
  $(this).animate({
     marginTop:'-20px',
     marginLeft:'50px'
  },'fast');
} else if (cardidthis == "card4") {
  $(this).animate({
     marginTop:'20px',
     marginLeft:'-15px'
  },'fast');
} else if (cardidthis == "card5") {
  $(this).animate({
     marginTop:'25px',
     marginLeft:'35px'
  },'fast');
}
this.flipped = 1;
			//Flip it around
			$(this).css({
				'box-shadow': 'none',
				'transform': 'rotateY(180deg) scale(1.15)',
				'-webkit-transform': 'rotateY(180deg) scale(1.15)',
				'transition': 'transform 800ms ease-in-out 250ms, box-shadow 500ms',
				'-webkit-transition': '-webkit-transform 800ms ease-in-out 250ms, box-shadow 500ms'
			});


		});
});

    $('#packwrapper').effect('bounce',500);
				var cardhoveraura = new Audio();
cardhoveraura.addEventListener('ended', function() {
    this.currentTime = 0;
    this.play();
}, false);
				cardhoveraura.volume = 0.03;



    $('.cards').mouseenter(function(){
if (!this.flipped) {
				if ($(this).attr('rarity') == "5") {
				cardhoveraura.src = "sounds/card_aura_legendary_lp.ogg";
				}
				if ($(this).attr('rarity') == "4") {
				cardhoveraura.src = "sounds/card_aura_epic_lp.ogg";
				}
				if ($(this).attr('rarity') == "3") {
				cardhoveraura.src = "sounds/card_aura_rare_lp.ogg";
				}
				if ($(this).attr('rarity') == "1") {
				cardhoveraura.src = "";
				}
				cardhoveraura.play();


				var cardhover = new Audio();
				cardhover.src = "sounds/card_mouse_over.ogg";
				cardhover.volume = 0.07;
				cardhover.play();
}

				//Then determine its rarity and set the background glow to the appropriate color
				if ($(this).attr('rarity') == "5") {
					var color = "#ff8000";
				}
				if ($(this).attr('rarity') == "4") {
					var color = "#cc33ff";
				}
				if ($(this).attr('rarity') == "3") {
					var color = "#0070dd";
				}
if (!this.flipped) {
			$(this).css({
					'box-shadow': '0 0 100px' + color,
					'transform': 'scale(1.15)',
					'-webkit-transform': 'scale(1.15)',
					'transition': 'transform 500ms, box-shadow 750ms',
					'-webkit-transition': '-webkit-transform 500ms, box-shadow 750ms'
			});

// alert($(this).attr('id'));

var cardidthis = $(this).attr('id');

if (cardidthis == "card1") {
  $(this).animate({
     marginTop:'-30px',
     marginLeft:'10px'
  },'fast');
} else if (cardidthis == "card2") {
  $(this).animate({
     marginTop:'-15px',
     marginLeft:'-25px'
  },'fast');
} else if (cardidthis == "card3") {
  $(this).animate({
     marginTop:'-20px',
     marginLeft:'50px'
  },'fast');
} else if (cardidthis == "card4") {
  $(this).animate({
     marginTop:'20px',
     marginLeft:'-15px'
  },'fast');
} else if (cardidthis == "card5") {
  $(this).animate({
     marginTop:'25px',
     marginLeft:'35px'
  },'fast');
}


}
    });





    $('.cards').mouseleave(function(){	

				cardhoveraura.src = "";
		

if (!this.flipped) {
				$(this).css({
					'box-shadow': 'none',
					'transform': 'scale(1)',
					'-webkit-transform': 'scale(1)',
					'transition': 'transform 500ms, box-shadow 500ms',
					'-webkit-transition': '-webkit-transform 500ms, box-shadow 500ms'

				});

  $(this).animate({
     marginTop:'0px',
     marginLeft:'0px'
  },'fast');

}
    });



        //audioElement.load()

        $.get();





        var audioElement_pack_lift = document.createElement('audio');
        audioElement_pack_lift.setAttribute('src', 'sounds/purchase_pack_lift_whoosh_1.ogg');

        var audioElement_pack_drop = document.createElement('audio');
        audioElement_pack_drop.setAttribute('src', 'sounds/purchase_pack_drop_impact_1.ogg');


  });

