/************** CONTENTS *************/

/* 1. History                  Class */
/* 1. HistoryEntry             Class */
/* 1. FeatureCollection        Class */
/* 2. BaseCollectionFeature    Class */
/* 2. MasterCollectionFeature  Class */
/* 5. MasterIndexFeature       Class */
/* 5. MasterIndex              Class */
/* 6. colorPalettes            Object*/
/**********************************************/


import Ajv from "ajv";
import addFormats from "ajv-formats";

export class History {
    constructor(indexVersion, baseVersion, masterVersion, props = [], verified = [], rejected = [], layerChanges = [], featurePropChanges=[], failure = [], notes = "") {
        this.id            = `HistoryEntry-${new Date().toISOString()}`;
        this.masterIdxVers = indexVersion;  
        this.baseSrcVers   = baseVersion;   
        this.masterSrcVers = masterVersion; 
        this.updatedProps  = props;         
        this.verifiedProps = verified;      
        this.rejectedProps = rejected;      
        this.layerChanges  = layerChanges;
        this.featurePropChanges = featurePropChanges;
        this.failure       = failure;
        this.notes         = notes;         
    }

    // ** ADD PROPERTIES HERE FOR UPDATE DATA VALIDATION         ** //
    // ** ONLY FIELDS IN THE 'PROPERTIES' OBJECT WILL BE ALLOWED ** //
    static ajv;
    static validator;
    static parcelUpdateSchema = {
        type: "object",
        properties: {
            // THIS SCHEMA DECIDES WHICH PROPERTIES ARE ACCEPTED AS ACTUAL UPDATES
            // IT WILL REJECT ANYTHING THAT DOES NOT FOLLOW THIS SCHEMA EXACTLY

            parcelNum:     { type: "string" }, // DO NOT REMOVE parcelNum!!!!
        },
        required: ["parcelNum"], // MUST BE INCLUDED TO UPATE!
        // additionalProperties: false 
    };

    // Static initializer block (runs once when class is first loaded)
    static {
        History.ajv = new Ajv({ allErrors: true });
        addFormats(History.ajv); // ← enable "date-time" and other format validations
        History.validator = History.ajv.compile(History.parcelUpdateSchema);
    }
}

export class HistoryEntry {
    constructor({ name = "unknown", type = "unknown", action = "unknown", item = null, details = "" }) {
        this.name      = name;      
        this.type      = type;      
        this.action    = action;    
        this.item      = item;       
        this.details   = details;   
    }
}

export class Layer {
    constructor(id, name, source, binCount, filter, type, visible = false, color) {
        this.id          = id;       // used for layer identification in mapbox
        this.name        = name;     // used for map key / toggling a layer
        this.source      = source;   // should point to "base-source" or "master-source"
        this.binCount    = binCount; // count of parcels for the specific bin
        this.filter      = filter;   // filters the specific data -> ["==", ["get", "fireDamage"], cat.label],
        this.type        = type      // circle / fill / line (most will be fill!)
        this.color       = color;    // rgb string color for the specific layer
        this.layout      = { visibility: visible ? "visible" : "none" }; // layers start turned "off" / "none"
        this.paint       = { 
            [`${type}-opacity`]: 1,
            [`${type}-color`]:   color,
        }
    }

    static generateLayerId(key, label) {
	    return `${key}-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/^-+|-+$/g, '');
    }

    // will need a standard format for layers to control opacity, colors, etc...
    static buildLayerFormulas(layer) {

        if (layer.key === 'parcels') {
            const baseLayer    = new Layer('parcels', 'Parcels', layer.src, layer.binCount, [], 'fill', true, '#e0e0e0');
            return [ baseLayer ];
        }
        if (layer.key === 'outline') {
            const outlineLayer = new Layer('outline', 'Outline', layer.src, layer.binCount, [], 'line', true, '#000000');
            outlineLayer.paint['line-width'] = 1;
            outlineLayer.paint['line-opacity'] = 0.7;
            return [ outlineLayer ];
        }

        if (!Array.isArray(layer.binValues) || layer.binValues.length < 1) {
            return []; 
        }

        const paletteType = `${layer.dataType}_1`;
        const colors = colorPalettes[paletteType].slice(0, layer.binValues.length);
        const sublayers = [];

        layer.binValues.forEach((value, index) => {
            let filter, label;

            if (layer.dataType === 'range' && Array.isArray(value) && value.length === 2) {
                // value is [min, max]
                const [min, max] = value;
                filter = ['all',
                    [">=", ["get", layer.key], min],
                    ["<",  ["get", layer.key], max]
                ];
                label = `${min} - ${max}`;
            } else {
                // Assume categorical
                filter = ["==", ["get", layer.key], value];
                label = String(value);
            }

            const sublayerId = Layer.generateLayerId(layer.key, label);
            sublayers.push(new Layer( sublayerId, label, layer.src, null, filter, layer.type, false, colors[index] ));
        });

        return sublayers;
    }

    static generateBins(sortedValues, binCount = 10) {
        if (!Array.isArray(sortedValues) || sortedValues.length === 0) 
            return { bins: [], counts: {} };

        const n = sortedValues.length;
        binCount = Math.min(binCount, n);

        const bins = [];
        const counts = {};

        const binSize = Math.floor(n / binCount);
        let startIdx = 0;

        for (let i = 0; i < binCount; i++) {
            const endIdx = (i === binCount - 1) ? n - 1 : (startIdx + binSize - 1);

            let binMin = sortedValues[startIdx];
            let binMax = sortedValues[endIdx];

            // Validate binMin and binMax
            if (typeof binMin !== 'number' || isNaN(binMin)) binMin = 0;
            if (typeof binMax !== 'number' || isNaN(binMax)) binMax = binMin;

            // Fix zero-width bin (binMin === binMax)
            if (binMin === binMax && endIdx < n - 1) {
                let nextIdx = endIdx + 1;
                while (nextIdx < n && sortedValues[nextIdx] === binMax) {
                    nextIdx++;
                }
                if (nextIdx < n) {
                    binMax = sortedValues[nextIdx];
                }
                // If no next distinct value, binMax stays the same
            }

            // Prevent overlapping bins
            if (i > 0) {
                const prevBinMax = bins[i - 1][1];
                if (typeof prevBinMax === 'number' && !isNaN(prevBinMax) && binMin <= prevBinMax) {
                    binMin = prevBinMax + 1;
                    if (binMin > binMax) {
                        binMin = binMax; // prevent binMin > binMax
                    }
                }
            }

            bins.push([binMin, binMax]);

            // Count values inside bin range
            let count = 0;
            for (let idx = startIdx; idx < n; idx++) {
                const val = sortedValues[idx];
                if (val >= binMin && val <= binMax) count++;
                else if (val > binMax) break;
            }

            const key = `${binMin} - ${binMax}`;
            counts[key] = count;

            // Move startIdx forward
            while (startIdx < n && sortedValues[startIdx] <= binMax) {
                startIdx++;
            }
        }

        return { bins, counts };
    }

}

export class FeatureCollection {
    constructor(name, features = [], layers = []) {
        this.type     = "FeatureCollection";
		this.id       = `${name}-${new Date().toISOString()}`; // "base-source" or "master-source" w/ date of creation
        this.name     = name       // "base-source" or "master-source" => for layers to point to
        this.features = features;  // PROPERTIES / PARCELS
        this.layers   = layers;    // Contains all data layers / properties being rendered w/ layer formulas 
    }

    // ** UPDATE LAYERS HERE FOR PUBLIC FACING LAYERS     ** //
    // ** LAYER_TYPES: FILL, LINE, CIRCLE (MOST ARE FILL) ** //
    static getBaseLayers() {
        return [
            // MAKE SURE THE SOURCE SAYS "base-source"! DO NOT REMOVE 'PARCELS' OR 'OUTLINE' 
            // THESE INITIAL TWO LAYERS ARE USED AS THE BASE LINEWORK AND SHADING FOR A SIMPLE MAP
            { key: "parcels",  name: "Parcels", src: "base-source",   dataType: "",  type: "fill", binValues: new Set(), binCount: {}, formulas: [], }, 
            { key: "outline",  name: "Outline", src: "base-source",   dataType: "",  type: "line", binValues: new Set(), binCount: {}, formulas: [], }, 
        ];
    }
    
    
    // ** UPDATE LAYERS HERE FOR USER FACING LAYERS **
    static getMasterLayers() {
        return [
            // MAKE SURE THE SOURCE SAYS "master-source"!
            { key: "zipCode",       name: "Zip Code",             src: "master-source", dataType: "category", type: "fill", binValues: new Set(), binCount: {}, formulas: [], }, 
            { key: "community",     name: "Neighborhood",         src: "master-source", dataType: "category", type: "fill", binValues: new Set(), binCount: {}, formulas: [], }, 
            { key: "propertyType",  name: "Property Type",        src: "master-source", dataType: "category", type: "fill", binValues: new Set(), binCount: {}, formulas: [], }, 
            { key: "structureCat",  name: "Structure",            src: "master-source", dataType: "category", type: "fill", binValues: new Set(), binCount: {}, formulas: [], }, 
            { key: "lotSizeMeters", name: "Lot Size (sq meters)", src: "master-source", dataType: "range"   , type: "fill", binValues: new Map(), binCount: {}, formulas: [], }, 
            { key: "lotSizeAcres",  name: "Lot Size (acres)",     src: "master-source", dataType: "range"   , type: "fill", binValues: new Map(), binCount: {}, formulas: [], }, 
            { key: "totalUnits",    name: "Total Units (pf)",     src: "master-source", dataType: "range"   , type: "fill", binValues: new Map(), binCount: {}, formulas: [], }, 
            { key: "damage",        name: "Fire Damage",          src: "master-source", dataType: "category", type: "fill", binValues: new Set(), binCount: {}, formulas: [], }, 
        ]
    }
}

export class BaseCollectionFeature {
    constructor(parcel) {
        this.type       = "Feature";
        this.geometry   = {
            type:          parcel?.type        ?? null,
            coordinates:   parcel?.coordinates ?? null,
        },
        this.properties = {
            // IF YOU ADD / CHANGE LAYERS => MUST HAVE PROPERTIES TO SUPPORT THE LAYER ->
            parcelNum:     parcel?.parcelNum   ?? null, 
            fullAddress:   parcel?.fullAddress ?? null,
        }
    }
}

export class MasterCollectionFeature {
    constructor(parcel) {
        this.type       = "Feature";
        this.geometry   = {
            type:             parcel?.type              ?? null,
            coordinates:      parcel?.coordinates       ?? null,
        },
        this.properties = {
            // IF YOU ADD / CHANGE LAYERS => MUST HAVE PROPERTIES TO SUPPORT THE LAYER ->
            assessorNum:      parcel?.assessorNum       ?? null,
            parcelNum:        parcel?.parcelNum         ?? null,
            centroid:         parcel?.centroid          ?? null,
            houseNum:         parcel?.houseNum          ?? null,
            street:           parcel?.street            ?? null,
            address:          parcel?.address           ?? null,
            cityState:        parcel?.cityState         ?? null,
            zipCode:          parcel?.zipCode           ?? null,
            fullAddress:      parcel?.fullAddress       ?? null,
            community:        parcel?.community         ?? null,
            propertyType:     parcel?.propertyType      ?? null,
            structureCat:     parcel?.structureCat      ?? null,
            yearBuilt:        parcel?.yearBuilt         ?? null,
            taxRateArea:      parcel?.taxRateArea       ?? null,
            taxRateCity:      parcel?.taxRateCity       ?? null,
            lotSizeMeters:    parcel?.lotSizeMeters     ?? null,
            lotSizeAcres:     parcel?.lotSizeAcres      ?? null,
            lastSaleDate:     parcel?.lastSaleDate      ?? null,
            lastSaleAmt:      parcel?.lastSaleAmt       ?? null,
            legalDescription: parcel?.legalDescription  ?? null,
            totalUnits:       parcel?.totalUnits        ?? null,
            units:            parcel?.units             ?? null,
            fireName:         parcel?.fireName          ?? null,
            damage:           parcel?.damage            ?? null,
            globalID:         parcel?.globalID          ?? null,
        }
    }
}

export class MasterIndexFeature {
    constructor(parcel) {
        this.type             = parcel?.type             ?? null;   
        this.coordinates      = parcel?.coordinates      ?? null;         
        this.assessorNum      = parcel?.assessorNum      ?? null;          
        this.parcelNum        = parcel?.parcelNum        ?? null;        
        this.centroid         = parcel?.centroid         ?? null;       
        this.houseNum         = parcel?.houseNum         ?? null;       
        this.street           = parcel?.street           ?? null;     
        this.address          = parcel?.address          ?? null;      
        this.cityState        = parcel?.cityState        ?? null;        
        this.zipCode          = parcel?.zipCode          ?? null;      
        this.fullAddress      = parcel?.fullAddress      ?? null;          
        this.community        = parcel?.community        ?? null;        
        this.propertyType     = parcel?.propertyType     ?? null;           
        this.structureCat     = parcel?.structureCat     ?? null;           
        this.yearBuilt        = parcel?.yearBuilt        ?? null;        
        this.taxRateArea      = parcel?.taxRateArea      ?? null;          
        this.taxRateCity      = parcel?.taxRateCity      ?? null;          
        this.lotSizeMeters    = parcel?.lotSizeMeters    ?? null;            
        this.lotSizeAcres     = parcel?.lotSizeAcres     ?? null;           
        this.lastSaleDate     = parcel?.lastSaleDate     ?? null;           
        this.lastSaleAmt      = parcel?.lastSaleAmt      ?? null;          
        this.legalDescription = parcel?.legalDescription ?? null;               
        this.totalUnits       = parcel?.totalUnits       ?? null;         
        this.units            = parcel?.units            ?? null;    
        this.fireName         = parcel?.fireName         ?? null;       
        this.damage           = parcel?.damage           ?? null;     
        this.globalID         = parcel?.globalID         ?? null;       
        this.ncArchStyle      = parcel?.ncArchStyle      ?? null;          
        this.ncGarageAttached = parcel?.ncGarageAttached ?? null;               
        this.ncAccDwellUnit   = parcel?.ncAccDwellUnit   ?? null;             
        this.ncADUattached    = parcel?.ncADUattached    ?? null;            
        this.ncConstMethod    = parcel?.ncConstMethod    ?? null;            
    }
}

export class MasterIndex {
    constructor(name, length = 0, features = {}, layers = []) {
        this.type     = "MasterIndex"
        this.name     = name;
        this.id       = `${name}-${new Date().toISOString()}`;
        this.length   = length
        this.features = features;
        this.layers   = layers; 
    }
}


/*
 * This product includes color specifications and designs developed by Cynthia
 * Brewer (http://colorbrewer.org/).
 
 https://groups.google.com/forum/?fromgroups=#!topic/d3-js/iyXFgJR1JY0
 */

 // HEX
const colorPalettes = {
  "diverge_1": ["#d53e4f", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#e6f598", "#abdda4", "#66c2a5", "#3288bd"],
  "diverge_2": ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#d9ef8b", "#a6d974", "#66bd63", "#1a9850"],
  "diverge_3": ["#b2182b", "#d66075", "#f4a582", "#fdcdbf", "#f7f7f7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac"],
  "diverge_4": ["#c51b7d", "#de77ae", "#f1b6da", "#fde0ef", "#f7f7f7", "#e6f5d0", "#b8e186", "#7fbc41", "#4d9221"],
  "diverge_5": ["#762a83", "#9970ab", "#c2a5cf", "#e7d4e8", "#f7f7f7", "#d9f0d3", "#a6dba0", "#5aae61", "#1b7837"],
  "diverge_6": ["#d73027", "#f46d43", "#fdae61", "#fee090", "#ffffbf", "#e0f3f8", "#abd9e9", "#74add1", "#4575b4"],
  "diverge_7": ["#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5", "#c7eae5", "#80cdc1", "#35978f", "#01665e"],
  "diverge_8": ["#b2182b", "#d66075", "#f4a582", "#fdcdbf", "#ffffff", "#e0e0e0", "#bababa", "#878787", "#4d4d4d"],
  "diverge_9": ["#b35806", "#e08214", "#fdb863", "#fee0b6", "#f7f7f7", "#d8dae9", "#b2abd2", "#8073ac", "#542788"],
  
  "category_1": ["#a6cee3", "#1f78b4", "#b2df8a", "#33a02c", "#fb9a99", "#e31a1c", "#fdbf6f", "#ff7f00", "#cab2d6", "#6a3d9a", "#ffff99", "#b15928", "#8dd3c7", "#ffffb3", "#bebada", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5", "#d9d9d9", "#bc80bd", "#ccebc5", "#ffed6f", "#7fc97f", "#beaed4", "#fdc086", "#ffff99", "#386cb0", "#f0027f", "#bf5b17", "#666666", "#ffb3ba", "#ffdfba", "#ffffba", "#baffc9", "#bae1ff", "#ffcced", "#ccffe5", "#e5ccff"],
  "category_2": ["#7fc97f", "#beaed4", "#fdc086", "#ffff99", "#386cb0", "#f0027f", "#bf5b17", "#666666", "#a6cee3", "#ffb6c1", "#6a3d9a", "#b2df8a"],
  "category_3": ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#ffff33", "#a65628", "#f781bf", "#999999", "#66c2a5", "#e7298a", "#66a61e"],
  "category_4": ["#8dd3c7", "#ffffb3", "#bebada", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5", "#ccebc5", "#ffed6f", "#cccccc", "#ffb6c1"],
  "category_5": ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666", "#ccebc5", "#9970ab", "#ffed6f", "#fddaec"],
  "category_6": ["#b3e2cd", "#fdcdac", "#cbd5e8", "#f4cae4", "#e6f5c9", "#fff2ae", "#f1e2cc", "#cccccc", "#ffed6f", "#decbe4", "#bf5b17", "#ccebc5"],
  "category_7": ["#fbb4ae", "#b3cde3", "#ccebc5", "#decbe4", "#fee5cc", "#ffffcc", "#e5d8bd", "#fddaec", "#f2f2f2", "#8da0cb", "#e78ac3", "#b3de69"],
  "category_8": ["#a6cee3", "#1f78b4", "#b2df8a", "#33a02c", "#fb9a99", "#e31a1c", "#fdbf6f", "#ff7f00", "#cab2d6", "#6a3d9a", "#ffff99", "#984ea3"],
  
  "range_1": ["#fff7ec", "#fee8c8", "#fdd49e", "#fdbb84", "#fc8d59", "#ef6548", "#d7301f", "#b30000", "#7f0000"],
  "range_2": ["#fff7fb", "#ece7f2", "#d0d1e6", "#a6bddb", "#74a9cf", "#3690c0", "#0570b0", "#045a8d", "#023858"],
  "range_3": ["#f7fcfd", "#e0ecf4", "#bfd3e6", "#9ecae1", "#8c96c6", "#8c6bb1", "#88419d", "#810f7c", "#4d004b"],
  "range_4": ["#fff5eb", "#fee6ce", "#fdd0a2", "#fdae6b", "#fd8d3c", "#f16913", "#d94801", "#a63603", "#7f2704"],
  "range_5": ["#f7fcfd", "#e5f5f9", "#ccffea", "#99d8c9", "#66c2a4", "#41ae76", "#238b45", "#006d2c", "#00441b"],
  "range_6": ["#ffffe5", "#fff7bc", "#fee391", "#fec44f", "#fe9929", "#ec7014", "#cc4c02", "#993404", "#662506"],
  "range_7": ["#ffffe5", "#f7fcb9", "#d9f0a3", "#addd8e", "#78c679", "#41ab5d", "#238443", "#006837", "#004529"],
  "range_8": ["#fff5f0", "#fee0d2", "#fcbba1", "#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#99000d", "#67000d"],
  "range_9": ["#fff7f3", "#fde0dd", "#fcc5c0", "#fa9fb5", "#f768a1", "#dd3497", "#ae017e", "#7a0177", "#49006a"],
  "range_10": ["#f7fcf5", "#e5f5e0", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#006d2c", "#00441b"],
  "range_11": ["#ffffd9", "#edf8b1", "#c7e9b4", "#7fcdc1", "#41b6c4", "#1d91c0", "#225ea8", "#253494", "#081d58"],
  "range_12": ["#fcfbfd", "#efedf5", "#dadaeb", "#bcbddc", "#9e9ac8", "#807dba", "#6a51a3", "#54278f", "#3f007d"],
  "range_13": ["#f7fcf0", "#e0f3db", "#ccebc5", "#a8ddb5", "#7bccc4", "#4eb3d3", "#2b8cbe", "#0868ac", "#084081"],
  "range_14": ["#ffffff", "#f0f0f0", "#d9d9d9", "#bdbdbd", "#969696", "#737373", "#525252", "#252525", "#000000"],
  "range_15": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"],
  "range_16": ["#f7f4f9", "#e7e1ef", "#d4b9da", "#c994c7", "#df65b0", "#e7298a", "#ce1256", "#980043", "#67001f"],
  "range_17": ["#f7fbff", "#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08519c", "#08306b"],
  "range_18": ["#fff7fb", "#ece2f0", "#d0d1e6", "#a6bddb", "#67a9cf", "#3690c0", "#02818a", "#016c59", "#014636"]
};
