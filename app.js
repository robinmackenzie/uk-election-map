window.addEventListener("DOMContentLoaded", main);
var config = {
  "width": 960,
  "height": 720,
}

async function main() {
  config["mapjson"] = await d3.json("./topo_wpc_uk_10pc.topo.json");
  config["data2015"] = await d3.json("./uk_ge_2015_v2.json");
  config["data2017"] = await d3.json("./uk_ge_2017_v2.json");
  renderMap();
}

function renderMap() {
  const projection = d3.geoMercator()
    .scale(1200)
    .center([1.5491, 53.8008]) // Leeds :)
    .rotate([12,0])
    .translate([config.width / 2, config.height / 2]);

  const zoom = d3.zoom()
    .scaleExtent([0.1, 100])
    .on("zoom", zoomed);

  const path = d3.geoPath()
    .projection(projection);

  const svg = d3.select("#map")
    .append("svg")
    .attr("width", "100%")
    .attr("height", config.height);

  const g = svg.append("g");
      
  // get uk map data features
  var uk = topojson.feature(config["mapjson"], config["mapjson"].objects.uk);

  // append election data to topo data
  for (var i=0; i<config["data2015"].length; i++) {
    for (var j=0; j<uk.features.length; j++) {
      if (config["data2015"][i].Id == uk.features[j].properties.PCON13CD) {
        uk.features[j].properties["color"] = config["data2015"][i]["Summary"].PartyColour;
        uk.features[j].properties["theyWorkForYouLink"] = config["data2015"][i]["Summary"].TheyWorkForYouLink;
        uk.features[j].properties["electionData"] = config["data2015"][i];
        break;
      }
    }
  }

  // add features to map
  g.selectAll("path")
    .data(uk.features)
    .enter()
    .append("path")
    .attr("d", path)
    .style("fill", function(d) {
      return d.properties.color;
    })
    .style("stroke-width", "0.8px")
    .style("vector-effect", "non-scaling-stroke")
    .style("stroke", "#e6e6e6")
      .style("opacity", 1.0)
    .on("click", clicked)
    .on("mouseover", highlight)
    .on("mouseout", unHighlight);
            
    svg.call(zoom); // delete this line to disable free zooming
      
    // info panel
    var info = d3.select("#map")
      .append("div")
      .html(d3.select("#infoPanelTemplate").html())
      .attr("class", "infoPanel hide");

    function zoomed() {
      var transform = d3.event.transform; 
      g.style("stroke-width", 1 / transform.k + "px");
      g.attr("transform", transform);
    }

    function highlight(d) {
      // set opacity and stroke on area
      d3.select(this)
        .transition()
        .duration(200)
        .style("opacity", 0.4)
        .style("stroke", "#242424");

      // update info div
      info.attr("class", "infoPanel");
      
      updateInfoPanelHtml(d.properties["electionData"]);
    }
      
    function unHighlight(d) {
      // reset opacity    
      d3.select(this)
        .transition()
        .duration(200)
        .style("stroke", "#e6e6e6")
        .style("opacity", 1);

      //info.attr("class", "infoPanel hide");    
    }
      
    function clicked(d) {
      console.log(d);
      var newWindow;
      var link = d.properties.theyWorkForYouLink;
      if (link != "") {
        // open link in new window
        newWindow = window.open(link, "_blank");
        newWindow.focus();
      }
    }
      
    function updateInfoPanelHtml(data) {

      info.select("#constituencyName")
        .text(data.Summary.Constituency);
      info.select("#winningCandidateName")
        .text("Winner: " + data.Summary.WinningCandidate);
      info.select("#winningPartyName")
        .text("Winner: " + data.Summary.WinningPartyName);
      info.select("#partyColourBlock")
        .style("background-color", data.Summary.PartyColour)
        .style("height", "5px")
        .style("width", "100%");
      info.select("#electorate")
        .text("Electorate: " + data.Summary.Electorate.toLocaleString("en-uk"));
      info.select("#turnout")
        .text("Turnout: " + data.Summary.ValidVotes.toLocaleString("en-uk"));
      info.select("#votes")
        .text("Votes for winner: " + data.Summary.WinningVoteCount.toLocaleString("en-uk"));
      info.select("#share")
        .text("Winning share: " + data.Summary.ValidVotePercent.toLocaleString("en-uk", {"style": "percent"}));

      // votes bar chart
      // amended from https://bl.ocks.org/alandunning/7008d0332cc28a826b37b3cf6e7bd998
      // and https://bl.ocks.org/mbostock/7341714

      // get voting data
      var votesRaw = data.CandidateVoteInfo.map(function(k) {
        return {
          "party": k.PartyAbbrevTransformed, 
          "votes": k.Votes, 
          "color": k.PartyColour 
        };
      });
      // sum over duplicate keys e.g. OTH
      var votes = [];
      var parties = [];
      votesRaw.forEach(function(item, index) {
        if (parties.indexOf(item.party) < 0) {
          parties.push(item.party);
          votes.push(item);
        } else {
          votes.filter(function(k) {
            return k.party == item.party;
          })[0].votes += item.votes;
        }
      });
      // sort ascending
      votes.sort(function(a, b) { return a.votes - b.votes; });

      var margin = {top: 5, left: 40},
        width = 150,
        height = votes.length * 30; 

      var x = d3.scaleLinear().range([0, width]);
      var y = d3.scaleBand().range([height, 0]);

      // remove old g from chart svg
      info.select("#svgVotes")
        .select("g")
        .remove();
      
      // add new g to chart svg
      var g = info 
        .select("#svgVotes") 
        .attr("height", height + 20)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

      // set up axes
      x.domain([0, d3.max(votes, function(d) { return d.votes; })]);
      y.domain(votes.map(function(d) { return d.party; })).padding(0.1);

      // append new g to chart svg
      g.append("g")
        .attr("class", "y axis")
        .call(d3.axisLeft(y));

      // add bars per votes data using party color
      // set up a g element for each entry in votes array
      var bars = g.selectAll(".bar")
        .data(votes)
        .enter();
        
      // append a rect for each g and set color, x, y, height and width
      bars.append("rect")
        .style("fill", function(d) {
          return d.color;
        })
        .attr("x", 0)
        .attr("height", y.bandwidth() )
        .attr("y", function(d) { return y(d.party); })
        .attr("width", function(d) { return x(d.votes); });

      // append a label just after rect with vote count
      bars.append("text")
        .attr("x", function(d) { return x(d.votes) + 4; })
        .attr("y", function(d, i) { return y(d.party) + (y.bandwidth() / 2); })
        .attr("dy", ".35em")
        .text(function(d) { return d.votes.toLocaleString("en-uk"); });

    }
}

// $(document).ready(function() {

//     //use queue.js to parallelize asynchronous data loading
//     d3.queue()
//       .defer(d3.json, "uk_ge_2015_v2.json") //load data csv
//       .defer(d3.json, "topo_wpc_uk_10pc.topo.json") //load geometry
//       .await(callback); //trigger callback function once data is loaded
      
//     function callback(error, sourceData, topoData, cityLatLong) {
//       if (error) {
//         alert("error");
//         return;
//       }

//       var width = 960, 
//         height = 720;

//       var projection = d3.geoMercator()
//         .scale(1200)
//         .center([1.5491, 53.8008]) // Leeds
//         .rotate([12,0])
//         .translate([width / 2, height / 2]);
        
//       var zoom = d3.zoom()
//         .scaleExtent([0.1, 100])
//         .on("zoom", zoomed);

//       var path = d3.geoPath()
//         .projection(projection);

//       var svg = d3.select("#map")
//         .append("svg")
//         .attr("width", "100%")
//         .attr("height", height);

//       var g = svg.append("g");
      
//       // get uk map data features
//       var uk = topojson.feature(topoData, topoData.objects.uk);

//       // append election data to topo data
//       for (var i=0; i<sourceData.length; i++) {
//         for (var j=0; j<uk.features.length; j++) {
//           if (sourceData[i].Id == uk.features[j].properties.PCON13CD) {
//             uk.features[j].properties["color"] = sourceData[i]["Summary"].PartyColour;
//             uk.features[j].properties["theyWorkForYouLink"] = sourceData[i]["Summary"].TheyWorkForYouLink;
//             uk.features[j].properties["electionData"] = sourceData[i];
//             break;
//           }
//         }
//       }

//       // add features to map
//       g.selectAll("path")
//         .data(uk.features)
//         .enter()
//         .append("path")
//         .attr("d", path)
//         .style("fill", function(d) {
//           return d.properties.color;
//         })
//         .style("stroke-width", "0.8px")
//         .style("vector-effect", "non-scaling-stroke")
//         .style("stroke", "#e6e6e6")
//           .style("opacity", 1.0)
//         .on("click", clicked)
//         .on("mouseover", highlight)
//         .on("mouseout", unHighlight);
               
//       svg.call(zoom); // delete this line to disable free zooming
        
//       // info panel
//       var info = d3.select("#map")
//         .append("div")
//         .html(d3.select("#infoPanelTemplate").html())
//         .attr("class", "infoPanel hide");

//       function zoomed() {
//         var transform = d3.event.transform; 
//         g.style("stroke-width", 1 / transform.k + "px");
//         g.attr("transform", transform);
//       }
      
//       function highlight(d) {

//         // set opacity and stroke on area
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("opacity", 0.4)
//           .style("stroke", "#242424");

//         // update info div
//         info.attr("class", "infoPanel");
        
//         updateInfoPanelHtml(d.properties["electionData"]);

//       }
      
//       function unHighlight(d) {
//         // reset opacity    
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("stroke", "#e6e6e6")
//           .style("opacity", 1);

//         //info.attr("class", "infoPanel hide");    
//       }
      
      
//       function clicked(d) {
//         console.log(d);
//         var newWindow;
//         var link = d.properties.theyWorkForYouLink;
//         if (link != "") {
//           // open link in new window
//           newWindow = window.open(link, "_blank");
//           newWindow.focus();
//         }
//       }
      
//       function updateInfoPanelHtml(data) {

//         info.select("#constituencyName")
//           .text(data.Summary.Constituency);
//         info.select("#winningCandidateName")
//           .text("Winner: " + data.Summary.WinningCandidate);
//         info.select("#winningPartyName")
//           .text("Winner: " + data.Summary.WinningPartyName);
//         info.select("#partyColourBlock")
//           .style("background-color", data.Summary.PartyColour)
//           .style("height", "5px")
//           .style("width", "100%");
//         info.select("#electorate")
//           .text("Electorate: " + data.Summary.Electorate.toLocaleString("en-uk"));
//         info.select("#turnout")
//           .text("Turnout: " + data.Summary.ValidVotes.toLocaleString("en-uk"));
//         info.select("#votes")
//           .text("Votes for winner: " + data.Summary.WinningVoteCount.toLocaleString("en-uk"));
//         info.select("#share")
//           .text("Winning share: " + data.Summary.ValidVotePercent.toLocaleString("en-uk", {"style": "percent"}));

//         // votes bar chart
//         // amended from https://bl.ocks.org/alandunning/7008d0332cc28a826b37b3cf6e7bd998
//         // and https://bl.ocks.org/mbostock/7341714

//         // get voting data
//         var votesRaw = data.CandidateVoteInfo.map(function(k) {
//           return {
//             "party": k.PartyAbbrevTransformed, 
//             "votes": k.Votes, 
//             "color": k.PartyColour 
//           };
//         });
//         // sum over duplicate keys e.g. OTH
//         var votes = [];
//         var parties = [];
//         votesRaw.forEach(function(item, index) {
//           if (parties.indexOf(item.party) < 0) {
//             parties.push(item.party);
//             votes.push(item);
//           } else {
//             votes.filter(function(k) {
//               return k.party == item.party;
//             })[0].votes += item.votes;
//           }
//         });
//         // sort ascending
//         votes.sort(function(a, b) { return a.votes - b.votes; });

//         var margin = {top: 5, left: 40},
//           width = 150,
//           height = votes.length * 30; 

//         var x = d3.scaleLinear().range([0, width]);
//         var y = d3.scaleBand().range([height, 0]);

//         // remove old g from chart svg
//         info.select("#svgVotes")
//           .select("g")
//           .remove();
        
//         // add new g to chart svg
//         var g = info 
//           .select("#svgVotes") 
//           .attr("height", height + 20)
//           .append("g")
//           .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

//         // set up axes
//         x.domain([0, d3.max(votes, function(d) { return d.votes; })]);
//         y.domain(votes.map(function(d) { return d.party; })).padding(0.1);

//         // append new g to chart svg
//         g.append("g")
//           .attr("class", "y axis")
//           .call(d3.axisLeft(y));

//         // add bars per votes data using party color
//         // set up a g element for each entry in votes array
//         var bars = g.selectAll(".bar")
//           .data(votes)
//           .enter();
          
//         // append a rect for each g and set color, x, y, height and width
//         bars.append("rect")
//           .style("fill", function(d) {
//             return d.color;
//           })
//           .attr("x", 0)
//           .attr("height", y.bandwidth() )
//           .attr("y", function(d) { return y(d.party); })
//           .attr("width", function(d) { return x(d.votes); });

//         // append a label just after rect with vote count
//         bars.append("text")
//           .attr("x", function(d) { return x(d.votes) + 4; })
//           .attr("y", function(d, i) { return y(d.party) + (y.bandwidth() / 2); })
//           .attr("dy", ".35em")
//           .text(function(d) { return d.votes.toLocaleString("en-uk"); });

//       }
            
//     }
    
//   });