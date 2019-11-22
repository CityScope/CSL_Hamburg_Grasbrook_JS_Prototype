import "./Storage";
import { getCityIO } from "./cityio";
import { Deck } from "@deck.gl/core";
import { MapboxLayer } from "@deck.gl/mapbox";
import { TripsLayer } from "@deck.gl/geo-layers";
import { PathLayer } from "@deck.gl/layers";
import {} from "module";
import transformScale from "@turf/transform-scale";
import { Update } from "./update";
import { UI } from "./ui";

export class Layers {
  constructor() {
    this.map = Storage.map;
    this.updateableLayersList = {};
  }

  async layersLoader() {
    console.log("Getting list of existing layers form ciytIO..");
    let cityioHashes = await getCityIO(Storage.cityIOurl + "/meta");
    cityioHashes = cityioHashes.hashes;
    // load 3d building Layer first, from MAPBOX api
    this.buildingLayer();
    // then cycle between known layers
    for (let hashName in cityioHashes) {
      switch (hashName) {
        case "meta_grid":
          // check if there is mapping hash
          if (!Object.keys(cityioHashes).includes("interactive_grid_mapping")) {
            console.log("missing grid mapping..stopping CityScopeJS");
            return;
          }
          await this.gridLayer();

          break;
        case "grid":
          this.updateableLayersList[hashName] = cityioHashes[hashName];
          break;
        case "ABM":
          await this.ABMlayer();
          this.updateableLayersList[hashName] = cityioHashes[hashName];
          break;
        case "access":
          await this.accessLayer();
          this.updateableLayersList[hashName] = cityioHashes[hashName];
          break;
        default:
          break;
      }
    }
    // await Promise.all([this.gridLayer(), this.ABMlayer(), this.accessLayer()]);
    Storage.updateableLayersList = this.updateableLayersList;

    // load UI for updateable Layers List
    let ui = new UI();
    ui.init();
    let update = new Update(Storage.updateableLayersList);
    update.startUpdate();
  }

  async gridLayer() {
    // get the mapping of the grid
    Storage.interactiveGridMapping = await getCityIO(
      Storage.cityIOurl + "/interactive_grid_mapping"
    );
    // get  the grid GEOjson itself
    Storage.gridGeoJSON = await getCityIO(Storage.cityIOurl + "/meta_grid");

    // Active layer
    this.map.addSource("gridGeoJSONSource", {
      type: "geojson",
      data: Storage.gridGeoJSON
    });

    this.map.addLayer({
      id: "gridGeoJSON",
      type: "fill-extrusion",
      source: "gridGeoJSONSource",
      paint: {
        "fill-extrusion-color": ["get", "color"],
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-opacity": 0.8,
        "fill-extrusion-base": 1
      }
    });

    for (let i = 0; i < Storage.gridGeoJSON.features.length; i++) {
      if (Storage.gridGeoJSON.features[i].properties.interactive_id == null) {
        transformScale(Storage.gridGeoJSON.features[i], 0.2, { mutate: true });
      } else {
        transformScale(Storage.gridGeoJSON.features[i], 0.8, { mutate: true });
      }
    }
    Storage.map.getSource("gridGeoJSONSource").setData(Storage.gridGeoJSON);
  }

  async ABMlayer() {
    /*
  deck layer
    https://github.com/uber/deck.gl/blob/master/docs/api-reference/mapbox/mapbox-layer.md
    https://github.com/uber/deck.gl/blob/master/docs/api-reference/mapbox/overview.md?source=post_page---------------------------#using-with-pure-js
  */

    console.log("starting ABM..");

    // get data at init
    Storage.ABMdata = await getCityIO(Storage.cityIOurl + "/ABM");

    let timeStampDiv = document.getElementById("timeStamp");
    let simPaceDiv = document.getElementById("simPaceDiv");
    let startSimHour = 60 * 60 * 7;
    let endSimHour = 60 * 60 * 12;
    let time = startSimHour;
    // a day in sec = 86400;
    let simPaceValue = 5;
    let loopLength = endSimHour - startSimHour;
    let refreshIntervalId;
    // ! GUI
    var mobilitySlider = document.getElementById("mobilitySlider");
    var simPaceSlider = document.getElementById("simPaceSlider");
    mobilitySlider.addEventListener("input", function() {
      time = startSimHour + (mobilitySlider.value / 100) * loopLength;
    });
    simPaceSlider.addEventListener("input", function() {
      simPaceValue = simPaceSlider.value / 100;
    });

    const deckContext = new Deck({
      gl: this.map.painter.context.gl,
      layers: []
    });

    Storage.map.addLayer(
      new MapboxLayer({
        id: ["ABMLayer"],
        deck: deckContext
      })
    );

    async function renderDeck() {
      let ABMmodeType = Storage.ABMmodeType;

      var mapZoom =
        Storage.map.getZoom() > 14 ? 1.5 : Storage.map.getZoom() / 1.5;

      if (time >= startSimHour + loopLength - 1) {
        time = startSimHour;
      } else {
        time = time + simPaceValue;
      }
      // toggle abm layer mode or type
      if (ABMmodeType == "All") {
        deckContext.setProps({
          layers: [
            new PathLayer({
              id: "line",
              data: Storage.ABMdata,
              getPath: d => {
                const noisePath =
                  Math.random() < 0.5
                    ? Math.random() * 0.00005
                    : Math.random() * -0.00005;

                for (let i in d.path) {
                  d.path[i][0] = d.path[i][0] + noisePath;
                  d.path[i][1] = d.path[i][1] + noisePath;
                }

                return d.path;
              },
              getColor: d => {
                //switch between modes or types of users
                switch (d.mode[1]) {
                  case 0:
                    return [255, 0, 0];
                  case 1:
                    return [0, 0, 255];
                  case 2:
                    return [0, 255, 0];
                }
              },
              getWidth: mapZoom / 5
            })
          ]
        });
        //
      } else if (ABMmodeType == "Modes") {
        deckContext.setProps({
          layers: [
            new TripsLayer({
              id: "modes",
              data: Storage.ABMdata,
              getPath: d => d.path,
              getTimestamps: d => d.timestamps,
              getColor: d => {
                switch (d.mode[0]) {
                  case 0:
                    //purple
                    return [255, 0, 255];
                  case 1:
                    //blue
                    return [60, 128, 255];
                  case 2:
                    // green
                    return [153, 255, 51];
                  case 3:
                    // yellow
                    return [255, 255, 0];
                }
              },
              getWidth: mapZoom,
              rounded: true,
              trailLength: 100,
              currentTime: time
            })
          ]
        });
      } else if (ABMmodeType == "Types") {
        deckContext.setProps({
          layers: [
            new TripsLayer({
              id: "types",
              data: Storage.ABMdata,
              getPath: d => d.path,
              getTimestamps: d => d.timestamps,
              getColor: d => {
                //switch between modes or types of users
                switch (d.mode[1]) {
                  case 0:
                    return [255, 0, 0];
                  case 1:
                    return [0, 0, 255];
                  case 2:
                    return [0, 255, 0];
                }
              },
              getWidth: mapZoom,
              rounded: true,
              trailLength: 200,
              currentTime: time
            })
          ]
        });
      } else {
        deckContext.setProps({
          layers: []
        });
      }

      // print the time on div
      var dateObject = new Date(null);
      dateObject.setSeconds(time); // specify value for SECONDS here
      var timeString = dateObject.toISOString().substr(11, 8);
      timeStampDiv.innerHTML = "time: " + timeString;
      simPaceDiv.innerHTML = "simulation pace x" + simPaceValue;
    }

    //! cancel by: clearInterval(refreshIntervalId);

    // start animation loop
    refreshIntervalId = setInterval(() => {
      renderDeck();
    });
  }

  buildingLayer() {
    /*
  3d buildings
  */
    this.map.addLayer({
      id: "3dBuildingsLayer",
      displayName: "3dBuildingsLayer",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 10,
      paint: {
        "fill-extrusion-color": "#fff",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0.1,
          10,
          15.05,
          ["get", "height"]
        ],
        "fill-extrusion-opacity": 0.7
      }
    });

    this.map.setLayoutProperty("3dBuildingsLayer", "visibility", "none");
  }

  async accessLayer() {
    /*
   Access
  */
    let accessData = await getCityIO(Storage.cityIOurl + "/access");
    Storage.accessLayerProps = accessData.features[0].properties;

    this.map.addSource("accessSource", {
      type: "geojson",
      data: Storage.cityIOurl + "/access"
    });

    // Access
    this.map.addLayer({
      id: "AccessLayerHeatmap",
      type: "heatmap",
      source: "accessSource",
      paint: {
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["get", Object.keys(Storage.accessLayerProps)[0]],
          0,
          0.02,
          1,
          1
        ],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0.1,
          15,
          1,
          16,
          3
        ],
        // Adjust the heatmap radius by zoom level
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          1,
          15,
          100,
          16,
          300
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(255,0,0,0)",
          0.05,
          "red",
          0.4,
          "rgb(255, 124, 1)",
          0.6,
          "yellow",
          0.8,
          "rgb(142, 255, 0)",
          1,
          "green"
        ],

        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 1, 1, 15, 0.7]
      }
    });
    this.map.setLayoutProperty("AccessLayerHeatmap", "visibility", "none");
  }
}

// access layer change
export function cycleAccessLayers(accessLayer) {
  accessLayer = accessLayer.toString();
  Storage.accessState = accessLayer;

  Storage.map.setPaintProperty("AccessLayerHeatmap", "heatmap-weight", [
    "interpolate",
    ["linear"],
    ["get", accessLayer],
    0,
    0.02,
    1,
    1
  ]);

  let accessHeatmapColorsArray = {
    food: [
      "interpolate",
      ["linear"],
      ["heatmap-density"],

      0,
      "rgba(255,0,0,0)",
      0.05,
      " rgba(112, 100, 179, 1)",
      0.4,
      "rgba(178, 219, 191, 1)",
      0.6,
      " rgba(243, 255, 189, 1)",
      0.8,
      " rgba(255, 150, 189, 1)",
      1,
      " rgba(255, 22, 84, 1)"
    ],
    groceries: [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(255,0,0,0)",
      0.05,
      "#EE3E32",
      0.3,
      "#fbb021",
      0.6,
      "#1b8a5a",
      0.8,
      "#1d4877"
    ],
    nightlife: [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(255,0,0,0)",
      0.05,
      "#5681b9",
      0.4,
      "#93c4d2",
      0.6,
      "#ffa59e",
      0.8,
      "#dd4c65",
      0.9,
      "#93003a"
    ],
    education: [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(255,0,0,0)",
      0.05,
      "red",
      0.4,
      "rgb(255, 124, 1)",
      0.6,
      "yellow",
      0.8,
      "rgb(142, 255, 0)",
      1,
      "green"
    ]
  };

  Storage.map.setPaintProperty(
    "AccessLayerHeatmap",
    "heatmap-color",
    accessHeatmapColorsArray[accessLayer]
  );
}