<template>
  <div class="leaflet-maps" style="height: 100%">
    <template v-if="apiError">
      <va-alert color="danger" outline class="mb-4">{{ $t('api.error') }}: {{ apiError }}</va-alert>
    </template>
    <va-inner-loading :loading="item && isBusy">
      <va-card title="Leaflet Maps">
        <div id="sidebar" ref="sidebarContainer" class="leaflet-sidebar collapsed">
          <!-- Nav tabs -->
          <div class="leaflet-sidebar-tabs">
            <ul role="tablist">
              <!-- top aligned tabs -->
              <li>
                <a href="#summary" role="tab"><VaIcon name="summarize" /></a>
              </li>
              <li>
                <a href="#performance" role="tab"><VaIcon name="bar_chart" /></a>
              </li>
              <li>
                <a href="#observations" role="tab"><VaIcon name="settings_suggest" /></a>
              </li>
              <li>
                <a href="#export" role="tab"><VaIcon name="ios_share" /></a>
              </li>
            </ul>

            <ul role="tablist">
              <!-- bottom aligned tabs -->
              <li>
                <a href="#monitoring" role="tab"><VaIcon name="stream" /></a>
              </li>
            </ul>
          </div>

          <!-- Tab panes -->
          <div class="leaflet-sidebar-content">
            <div id="summary" class="leaflet-sidebar-pane">
              <h1 class="leaflet-sidebar-header">
                Summary
                <div class="leaflet-sidebar-close"><VaIcon name="close" /></div>
              </h1>
              <template v-if="item">
                <tripSummary
                  v-if="item"
                  :logbook="item"
                  :form-data="formData"
                  :loading="isBusy"
                  @delete="handleDelete"
                  @save="handleSubmit"
                />
              </template>
            </div>

            <div id="performance" class="leaflet-sidebar-pane">
              <h1 class="leaflet-sidebar-header">
                Performance
                <div class="leaflet-sidebar-close"><VaIcon name="close" /></div>
              </h1>
              <template v-if="item">
                <tripPerformance
                  v-if="item"
                  :winddata="wind_arr"
                  :speeddata="speed_arr"
                  :labels="labels_arr"
                  :loading="isBusy"
                />
              </template>
            </div>

            <div id="observations" class="leaflet-sidebar-pane">
              <h1 class="leaflet-sidebar-header">
                Observations
                <div class="leaflet-sidebar-close"><VaIcon name="close" /></div>
              </h1>
              <template v-if="item">
                <tripObservations v-if="item" :logbook="item" :form-data="formData" :loading="isBusy"
              /></template>
            </div>

            <div id="export" class="leaflet-sidebar-pane">
              <h1 class="leaflet-sidebar-header">
                Export / Sharing
                <div class="leaflet-sidebar-close"><VaIcon name="close" /></div>
              </h1>
              <template v-if="item">
                <tripExport v-if="item" :logbook="item" :form-data="formData" :loading="isBusy"
              /></template>
            </div>

            <div id="monitoring" class="leaflet-sidebar-pane">
              <h1 class="leaflet-sidebar-header">
                Live monitoring
                <div class="leaflet-sidebar-close"><VaIcon name="close" /></div>
              </h1>
              <template v-if="item"> </template>
            </div>
          </div>
        </div>

        <div id="mapContainer" ref="mapContainer" class="sidebar-map" style="height: 80vh" />
      </va-card>
    </va-inner-loading>
  </div>
</template>

<script setup>
  import 'leaflet/dist/leaflet.css'
  import 'leaflet-sidebar-v2/css/leaflet-sidebar.min.css'
  import * as L from 'leaflet'
  import 'leaflet-sidebar-v2'

  import { computed, ref, reactive, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import PostgSail from '../../services/api-client'
  import { useCacheStore } from '../../stores/cache-store'
  import {
    dateFormatUTC,
    durationFormatHours,
    durationI18nHours,
    durationI18nDays,
    dateFormatTime,
  } from '../../utils/dateFormatter.js'
  import { distanceFormat } from '../../utils/distanceFormatter.js'
  import { speedFormat } from '../../utils/speedFormatter.js'
  import { sailConfigImage, awaFormat, angleFormat } from '../../utils/angleFormatter.js'
  import lMap from '../../components/maps/leafletMap.vue'
  import { asBusy, handleExport } from '../../utils/handleExports'
  import { seaState, visibility } from '../../utils/PostgSail'
  import MySelect from '../../components/vaSelect.vue'
  import { useModal, useToast } from 'vuestic-ui'
  const { confirm } = useModal()
  const { init: initToast } = useToast()
  import logBook from '../../data/logbook.json'
  import { useGlobalStore } from '../../stores/global-store'
  const { isLoggedIn, publicVessel, instagram, website, readOnly } = useGlobalStore()

  import tripSummary from './sidebars/Summary.vue'
  import tripPerformance from './sidebars/Performance.vue'
  import tripObservations from './sidebars/Observations.vue'
  import tripExport from './sidebars/Export.vue'

  const CacheStore = useCacheStore()
  const route = useRoute()
  const isBusy = ref(false)
  const apiError = ref(null)
  const updateError = ref(null)
  const apiData = reactive({ row: null })
  const formData = reactive({
    isValid: true,
    name: null,
    notes: null,
    geojson: null,
  })
  const mapContainer = ref(),
    map = ref(),
    sidebarContainer = ref(),
    sidebar = ref(),
    speed_arr = ref([]),
    wind_arr = ref([]),
    labels_arr = ref([]),
    GeoJSONlayer = ref(),
    GeoJSONfeatures = ref(),
    GeoJSONbasemapObj = ref({})

  const item = computed(() => {
    return apiData.row
      ? {
          id: apiData.row.id,
          name: apiData.row.name,
          from: apiData.row.from,
          to: apiData.row.to,
          fromTime: dateFormatUTC(apiData.row.started),
          toTime: dateFormatUTC(apiData.row.ended),
          distance: distanceFormat(apiData.row.distance),
          duration: durationFormatHours(apiData.row.duration) + ' ' + durationI18nHours(apiData.row.duration),
          notes: apiData.row.notes,
          geoJson: apiData.row.geojson,
          avg_speed: speedFormat(apiData.row.avg_speed),
          max_speed: speedFormat(apiData.row.max_speed),
          max_wind_speed: speedFormat(apiData.row.max_wind_speed),
          extra: apiData.row?.extra?.metrics,
          seaState: apiData.row?.extra?.observations?.seaState || -1,
          cloudCoverage: apiData.row?.extra?.observations?.cloudCoverage || -1,
          visibility: apiData.row?.extra?.observations?.visibility || -1,
          from_moorage_id: apiData.row.from_moorage_id,
          to_moorage_id: apiData.row.to_moorage_id,
        }
      : {}
  })
  const mapGeoJsonFeatures = computed(() => {
    return item.value && item.value.geoJson && item.value.geoJson.features && Array.isArray(item.value.geoJson.features)
      ? item.value.geoJson.features
      : []
  })
  const canSubmit = computed(() => {
    const isDirty = item.value.name !== formData.name || item.value.notes !== formData.notes
    return !isBusy.value && formData.isValid && isDirty
  })
  onMounted(async () => {
    isBusy.value = true
    apiError.value = null
    const id = route.params.id
    try {
      const response = await CacheStore.getAPI('log_get', id)
      apiData.row = response[0]
      formData.name = apiData.row.name || null
      formData.notes = apiData.row.notes || null
      formData.geojson = apiData.row.geojson || null
      cloudCoverage.value = apiData.row?.extra?.observations?.cloudCoverage || -1
      document.title = `${publicVessel}'s Trip From ${apiData.row.name}`
      let geo_arr = apiData.row.geojson.features
      for (var i = 1; i < geo_arr.length; i++) {
        //console.log(geo_arr[i].properties)
        wind_arr.value.push(geo_arr[i].properties.truewindspeed)
        speed_arr.value.push(geo_arr[i].properties.speedoverground)
        labels_arr.value.push(dateFormatTime(geo_arr[i].properties.time))
      }
      map_setup()
    } catch (e) {
      apiError.value = e
      if (!import.meta.env.PROD && import.meta.env.VITE_APP_INCLUDE_DEMOS) {
        console.warn('Fallback using sample data from local json...', apiError.value)
        const row = logBook.find((row) => row.id == route.params.id)
        apiData.row = row
      }
    } finally {
      isBusy.value = false
    }
  })
  const cloudCoverage = ref(-1)
  const map_setup = () => {
    GeoJSONfeatures.value = mapGeoJsonFeatures.value
    let centerLat = 0
    let centerLng = 0
    if (mapGeoJsonFeatures.value && mapGeoJsonFeatures.value.geometry) {
      centerLat = mapGeoJsonFeatures.value.geometry.coordinates[1]
      centerLng = mapGeoJsonFeatures.value.geometry.coordinates[0]
    }

    if (mapGeoJsonFeatures.value && mapGeoJsonFeatures.value.length > 0) {
      const midPoint = Math.round(mapGeoJsonFeatures.value.length / 2)
      console.log(`${mapGeoJsonFeatures.value.length} ${midPoint}`)
      console.log(mapGeoJsonFeatures.value)
      centerLat = mapGeoJsonFeatures.value[midPoint].geometry.coordinates[1]
      centerLng = mapGeoJsonFeatures.value[midPoint].geometry.coordinates[0]
    }
    console.debug(`DetailsMap`, GeoJSONfeatures.value)
    if (centerLat == 0 && centerLng == 0) return

    console.debug(`DetailsMap centerLatLng: ${centerLat} ${centerLng}`)
    map.value = L.map(mapContainer.value, {
      zoomControl: false,
      zoomAnimation: false,
    }).setView([centerLat, centerLng], 17)
    // Add new Zoom control
    L.control.zoom({ position: 'bottomright' }).addTo(map.value)
    // OSM
    const osm = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    })
    // OpenSeaMap
    const openseamap = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors',
      maxZoom: 18,
    })
    // Satellite
    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 17,
      },
    )
    // NOAA
    const noaa = L.tileLayer('https://tileservice.charts.noaa.gov/tiles/50000_1/{z}/{x}/{y}.png', {
      attribution: 'NOAA',
      maxZoom: 18,
    })
    const cartodb = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attribution">CARTO</a>',
      maxZoom: 18,
    })
    // https://emodnet.ec.europa.eu
    const bathymetryLayer = L.tileLayer.wms('http://ows.emodnet-bathymetry.eu/wms', {
      layers: 'emodnet:mean_atlas_land',
      format: 'image/png',
      transparent: true,
      attribution: 'EMODnet Bathymetry',
      opacity: 0.8,
    })
    const coastlinesLayer = L.tileLayer.wms('http://ows.emodnet-bathymetry.eu/wms', {
      layers: 'coastlines',
      format: 'image/png',
      transparent: true,
      attribution: 'EMODnet Bathymetry',
      opacity: 0.8,
    })
    const bathymetryGroupLayer = L.layerGroup([bathymetryLayer, coastlinesLayer])
    //bathymetryGroupLayer.addTo(map)

    const baseMaps = {
      OpenStreetMap: osm,
      Satellite: sat,
      NOAA: noaa,
      Carto: cartodb,
      'EMODnet Bathymetry': bathymetryGroupLayer,
    }
    const overlays = {
      OpenSeaMap: openseamap,
    }
    L.control.layers(baseMaps, overlays).addTo(map.value)
    baseMaps['OpenStreetMap'].addTo(map.value)
    openseamap.addTo(map.value)

    const sailConfigIconImg = function (feature) {
      if (
        feature.properties.status == 'sailing' &&
        feature.properties.truewinddirection &&
        feature.properties.courseovergroundtrue
      ) {
        return sailConfigImage(feature.properties.truewinddirection, feature.properties.courseovergroundtrue)
      }
      return '/sailboat-000.png'
    }

    const sailConfigIcon = function (feature, latlng) {
      return L.marker(latlng, {
        icon: new L.Icon({
          iconSize: [32, 32],
          iconAnchor: [16, 10],
          iconUrl: sailConfigIconImg(feature),
        }),
        rotationAngle: feature.properties.courseovergroundtrue,
      })
    }
    const sailBoatIcon = function (feature, latlng) {
      return L.marker(latlng, {
        icon: new L.Icon({
          iconSize: [16, 32],
          iconAnchor: [8, 10],
          iconUrl: '/sailboaticon.png',
        }),
        rotationAngle: feature.properties.courseovergroundtrue,
      })
    }
    const powerBoatIcon = function (feature, latlng) {
      return L.marker(latlng, {
        icon: new L.Icon({
          iconSize: [16, 32],
          iconAnchor: [8, 10],
          iconUrl: '/powerboaticon.png',
        }),
        rotationAngle: feature.properties.courseovergroundtrue,
      })
    }
    const simpleDotIcon = function (feature, latlng) {
      return L.circleMarker(latlng, {
        radius: 2,
        fillColor: '#00FFFF',
        color: '#000',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
      })
    }

    const popup = function (feature, layer) {
      /* Boat popup
                    Boat Name
            Time	13 minutes ago
            Boat Speed	0 knots
            Wind Speed	4 knots
            Latitude	41.3869066667
            Longitude	2.19916333333
            */
      /* Track popup
                    Boat Name
              Time	8/8/2022, 11:11:30 AM
              Boat Speed	4.2 knots
              Latitude	39.5302133333
              Longitude	2.34970166667
            */
      var popupContent =
        '<p>I started out as a GeoJSON ' + feature.geometry.type + ", but now I'm a Leaflet vector!</p>"
      // If geo Point click
      if (feature.properties && feature.properties.time) {
        //console.log(`popup`, feature.properties)
        let status = feature.properties.status || ''
        let time = dateFormatUTC(feature.properties.time)
        let speed = speedFormat(feature.properties.speedoverground) || 0
        let cog = angleFormat(feature.properties.courseovergroundtrue) || 0
        let awa = awaFormat(feature.properties.truewinddirection, feature.properties.courseovergroundtrue) || 0
        let wind = speedFormat(feature.properties.windspeedapparent) || 0
        let winddir = angleFormat(feature.properties.truewinddirection) || 0
        let latitude = parseFloat(feature.properties.latitude).toFixed(5)
        let longitude = parseFloat(feature.properties.longitude).toFixed(5)
        let text = `<div class='center' id='${time}'><h4>${publicVessel}: ${status}</h4></div><br/>
              Time: ${time}<br/>
              Boat Speed: ${speed}<br/>
              Course Over Ground: ${cog}<br/>
              Apparent Wind Angle: ${awa}<br/>
              Wind Speed: ${wind}<br/>
              Wind Direction: ${winddir}<br/>
              Latitude: ${latitude}<br/>
              Longitude: ${longitude}<br/>`
        // Form content
        let content =
          text +
          'Notes:<br/>' +
          "<textarea style='box-sizing: border-box;border-width: 1px;' id='noteTextarea' rows='4' cols='30'>" +
          feature.properties.notes +
          '</textarea><br>' +
          "<div class='center'><button class='save' onclick='saveNote(" +
          JSON.stringify(feature.geometry.coordinates) +
          ")'>Save</button>" +
          "<button class='delete' onclick='deletePoint(" +
          JSON.stringify(feature.geometry.coordinates) +
          ")'>Delete</button></div>"
        layer.bindPopup(content)

        // Save note to GeoJSON properties
        window.saveNote = async function (coordinates) {
          console.log('saveNote to update:', coordinates)
          var note = document.getElementById('noteTextarea').value
          //layer.closePopup()

          // Save the note to the GeoJSON
          for (let i = 0; i < GeoJSONfeatures.value.length; i++) {
            const geofeature = GeoJSONfeatures.value[i]
            // Check if the feature is a point
            if (geofeature.geometry.type === 'Point') {
              // Get the coordinates of the point
              const pointCoordinates = geofeature.geometry.coordinates
              // Check if the coordinates match the target coordinates
              if (pointCoordinates[0] === coordinates[0] && pointCoordinates[1] === coordinates[1]) {
                console.log('GeoJSONfeatures index:', i)
                GeoJSONfeatures.value[i].properties.notes = note
                break // Exit loop if the point is found
              }
            }
          }

          // Update GeoJSON layer on the map
          GeoJSONlayer.value.clearLayers()
          GeoJSONlayer.value.addData(GeoJSONfeatures.value)
          //console.log(GeoJSONfeatures.length)
          //console.log(GeoJSONfeatures)
          const track_geojson = {
            type: 'FeatureCollection',
            features: GeoJSONfeatures.value,
          }
          // Save change the new GeoJSON to the DB
          const isSaved = await handleSubmit(track_geojson)
          if (isSaved) {
            console.log('saveNote saved')
          }
        }

        // Delete point from GeoJSON features
        window.deletePoint = async function (coordinates) {
          console.log('deletePoint to delete:', coordinates)
          const toDelete = await confirmDeleteTrackpoint()
          if (toDelete) {
            console.log('deletePoint confirmed continue')
            GeoJSONfeatures.value = GeoJSONfeatures.value.filter(function (geofeature) {
              if (geofeature.geometry.type === 'Point') {
                return JSON.stringify(geofeature.geometry.coordinates) !== JSON.stringify(coordinates)
              } else if (geofeature.geometry.type === 'LineString') {
                geofeature.geometry.coordinates = geofeature.geometry.coordinates.filter(function (lineStringCoords) {
                  return JSON.stringify(lineStringCoords) !== JSON.stringify(coordinates)
                })
                return feature.geometry.coordinates.length > 0
              }
              return true
            })
            GeoJSONlayer.value.clearLayers()
            GeoJSONlayer.value.addData(GeoJSONfeatures.value)
            //console.log(GeoJSONfeatures.value.length)
            //console.log(GeoJSONfeatures.value)
            const track_geojson = {
              type: 'FeatureCollection',
              features: GeoJSONfeatures.value,
            }
            // Save change the new GeoJSON to the DB
            const isSaved = await handleSubmit(track_geojson)
            if (isSaved) {
              console.log('deletePoint removed')
            }
          }
          isBusy.value = false
          document.getElementById('mapContainer').style.display = ''
          console.log('deletePoint done')
        }
      }
      // If geo LineString click
      if (feature.properties && feature.properties._from_time) {
        //console.log(`popup`, feature.properties)
        // Those value are read directly from the geojson so they are unformatted.
        // We could used the log details item ref for performance
        let time = dateFormatUTC(feature.properties._from_time)
        let avg_speed = speedFormat(feature.properties.avg_speed)
        let duration = durationFormatHours(feature.properties.duration)
        let distance = parseFloat(feature.properties.distance).toFixed(1)
        let text = `<div class='center'><h4>${feature.properties.name}</h4></div><br/>
                Time: ${time}<br/>
                Average Speed: ${avg_speed}<br/>
                Duration: ${duration}<br/>
                Distance: ${distance}<br/>
                Notes: ${feature.properties.notes}<br/>`
        layer.bindPopup(text)
        layer.LineString = true // tag the layer to find it when name or notes is updated
        //console.log(layer)
      }
    }

    GeoJSONbasemapObj.value = {
      Sailboat: L.geoJSON(mapGeoJsonFeatures.value, {
        pointToLayer: sailBoatIcon,
        onEachFeature: popup,
      }),
      SailConfig: L.geoJSON(mapGeoJsonFeatures.value, {
        pointToLayer: sailConfigIcon,
        onEachFeature: popup,
      }),
      Powerboat: L.geoJSON(mapGeoJsonFeatures.value, {
        pointToLayer: powerBoatIcon,
        onEachFeature: popup,
      }),
      SimpleDots: L.geoJSON(mapGeoJsonFeatures.value, {
        pointToLayer: simpleDotIcon,
        onEachFeature: popup,
      }),
    }
    L.control.layers(GeoJSONbasemapObj.value).addTo(map.value)
    GeoJSONbasemapObj.value['Sailboat'].addTo(map.value)
    map.value.fitBounds(GeoJSONbasemapObj.value['Sailboat'].getBounds(), { maxZoom: 17, zoomControl: false })

    /*
    // Add geoJSON
    //console.log(geojson.length)
    GeoJSONlayer.value = L.geoJSON(mapGeoJsonFeatures.value, {
      pointToLayer: BoatIcon,
      onEachFeature: popup,
    }).addTo(map.value)
    map.value.fitBounds(GeoJSONlayer.value.getBounds(), { maxZoom: 17, zoomControl: false })
    */

    // Add sidebar
    sidebar.value = L.control
      .sidebar({
        autopan: false, // whether to maintain the centered map point when opening the sidebar
        closeButton: true, // whether to add a close button to the panes
        container: 'sidebar', // the DOM container or #ID of a predefined sidebar container that should be used
        position: 'left', // left or right
      })
      .addTo(map.value)

    // Custom control for external link
    var externalLinkControl = L.control({ position: 'bottomright' })
    externalLinkControl.onAdd = function () {
      var div = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
      div.innerHTML = `<a href="/maplapse/${item.value.id}?height=100vh" target="_blank"><i class="va-icon fa fa-external-link" style="font-size: 14px; height: 14px; line-height: 14px;" aria-hidden="true" notranslate=""><!----></i></a>`
      // Adding tooltip
      div.title = 'Extended map'
      return div
    }
    externalLinkControl.addTo(map.value)
  } // end map setup

  const confirmDeleteTrackpoint = async () => {
    console.log('confirmDeleteTrackpoint')
    sidebar.value.close()
    document.getElementById('mapContainer').style.display = 'none'
    isBusy.value = true
    updateError.value = null
    let canDelete = false

    const modal_result = await confirm({
      message: 'This will permanently delete the Trackpoint! Do you really want to continue?',
      title: 'Are you sure?',
      okText: 'Yes, I agree',
      cancelText: 'No, keep my data',
      zIndex: -9999,
    })
    if (modal_result) {
      canDelete = true
      if (readOnly) {
        initToast({
          message: `Demo account readonly`,
          position: 'top-right',
          color: 'warning',
        })
        return false
      }
    } else {
      isBusy.value = false
      document.getElementById('mapContainer').style.display = ''
      initToast('Operation cancel')
    }

    return canDelete
  }

  const handleSubmit = async (local_geojson) => {
    isBusy.value = true
    updateError.value = null

    if (readOnly) {
      initToast({
        message: `Demo account readonly`,
        position: 'top-right',
        color: 'warning',
      })
      isBusy.value = false
      return true
    }
    /* From the emit we received a logbook trip entry
      From the leaflet map we received a valid geojson */
    //console.debug(local_geojson.geoJson.features[0].properties)
    let geojson = {}
    if (local_geojson.name) {
      // If we have a log entry object, then update the geojson name in linestring geometry
      local_geojson.geoJson.features[0].properties.name = formData.name
      geojson = local_geojson.geoJson
      // Update the corresponding geojson display on the map.
      mapGeoJsonFeatures.value[0].properties.name = formData.name
      mapGeoJsonFeatures.value[0].properties.notes = formData.notes
      // Update the corresponding leaflet layer popup on lineString click
      Object.keys(GeoJSONbasemapObj.value).forEach((GeoJSONlayer) => {
        //GeoJSONbasemapObj.value.forEach(function (GeoJSONlayer) {
        GeoJSONbasemapObj.value[GeoJSONlayer].eachLayer(function (layer) {
          if (layer.LineString) {
            //console.log(layer)
            layer._popup.setContent(`<div class='center'><h4>${formData.name}</h4></div><br/>
                Time: ${item.value.fromTime}<br/>
                avg_speed: ${item.value.avg_speed}<br/>
                Duration: ${item.value.duration}<br/>
                Distance: ${item.value.distance}<br/>
                Notes: ${formData.notes}<br/>`)
          }
        })
      })
    } else {
      geojson = local_geojson
    }
    console.debug(local_geojson)
    const api = new PostgSail()
    const id = route.params.id
    const payload = {
      name: formData.name,
      notes: formData.notes,
      track_geojson: geojson,
    }
    try {
      const response = await api.log_update(id, payload)
      if (response) {
        console.log('log_update success', response)
        // Clean CacheStore and force refresh
        CacheStore.logs = []
        CacheStore.logs_get = []
        CacheStore.store_ttl = null
        return true
      } else {
        throw { response }
      }
    } catch (err) {
      const { response } = err
      console.log('log_update failed', response)
      updateError.value = response.message
    } finally {
      initToast({
        message: updateError.value ? `Error updating log entry` : `Successfully updated log entry`,
        position: 'top-right',
        color: updateError.value ? 'warning' : 'success',
      })
      isBusy.value = false
    }
  }

  const handleDelete = async (log) => {
    sidebar.value.close()
    document.getElementById('mapContainer').style.display = 'none'
    isBusy.value = true
    updateError.value = null
    let canDelete = false

    const modal_result = await confirm({
      message: `This will permanently delete the Log Entry and any associated Stays. Do you really want to continue? Trip: ${log.name}`,
      title: 'Are you sure?',
      okText: 'Yes, I agree',
      cancelText: 'No, keep my data',
      zIndex: -9999,
    })
    if (modal_result) {
      canDelete = true
    } else {
      isBusy.value = false
      document.getElementById('mapContainer').style.display = ''
      initToast('Operation cancel')
    }

    if (!canDelete) return

    const api = new PostgSail()
    const id = route.params.id
    try {
      const response = await api.log_delete(id)
      if (response) {
        console.log('log_delete success', response)
      } else {
        throw { response }
      }
    } catch (err) {
      const { response } = err
      console.log('log_delete failed', response)
      updateError.value = response.message
    } finally {
      isBusy.value = false
    }
  }
</script>

<style>
  .save {
    width: 50%;
    padding: 5px;
    color: white;
    background-color: blue;
  }
  .delete {
    width: 50%;
    color: white;
    background-color: red;
    padding: 5px;
  }
</style>
