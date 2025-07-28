// MAP.JS

// PURPOSE OF THIS FILE:

// THIS FILE SERVES AS THE ONLY ENTRY POINT INTO UPDATING DATA RELATED TO THE MAP
// THE MASTER-INDEX IS A CLASS WITH A FEATURES PROPERTY WITH KEYS BASED ON THE PROPERTY PARCEL NUMBER -> 
// THIS ALLOWS QUICK UPDATES AND METHODS BUILT INTO THE CLASS TAKE CARE OF THE ENTIRE
// PROCESS OF BACKING UP, UPDATING, AND REWRITING THE GEOJSON FILES NEEDED TO DISPLAY MAP DATA

// THIS FILE SHOULD NOT BE ALTERED!!!!!!

// NOTE => THE SYSTEM CANNOT ACCEPT FILES THAT ARE NOT PART OF THE ORIGINAL DATASET 
// UNLESS A USER PROVIDES THE COORDINATES NEEDED TO DISPLAY THE INFORMATION ON THE MAP (which is highly unlikely)

import * as fs from 'fs/promises';
import path from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

import { FeatureCollection, BaseCollectionFeature, MasterCollectionFeature, MasterIndex, MasterIndexFeature, Layer, History, HistoryEntry } from "./map.js";

// BACKUP DIRECTORIES
const baseSrcBackupDir   = path.resolve(__dirname, "../map/base_source");
const masterSrcBackupDir = path.resolve(__dirname, "../map/master_source");
const masterIdxBackupDir = path.resolve(__dirname, "../map/master_index");
const historyDir         = path.resolve(__dirname, "../map/history");

// PRODUCTION DIRECTORIES
const masterIdxProdDir   = path.resolve(__dirname, "../map/master_index");
const mapSourceProdDir   = path.resolve(__dirname, "../src/map");

export default async function updateMap(updates = []) {

    if (updates.length === 0) return;

    // 0.0 SET CONSTANTS / GLOBAL VARS
    // MASTER INDEX
    const CURR_MASTER_INDEX            = await loadAndBackupJson(masterIdxBackupDir, 'master-index.json');
    const NEW_MASTER_INDEX             = new MasterIndex('master-index');

    // BASE SOURCE
    const CURR_BASE_SOURCE             = await loadAndBackupJson(baseSrcBackupDir,   'base-source.json');
    const NEW_BASE_SOURCE_COLLECTION   = new FeatureCollection('base-source');
    const NEW_BASE_SOURCE_LAYERS	   = FeatureCollection.getBaseLayers();
    
    // MASTER SOURCE
    const CURR_MASTER_SOURCE           = await loadAndBackupJson(masterSrcBackupDir, 'master-source.json');
    const NEW_MASTER_SOURCE_COLLECTION = new FeatureCollection('master-source');
    const NEW_MASTER_SOURCE_LAYERS     = FeatureCollection.getMasterLayers();

    // HISTORY ENTRY:
    const historyEntry = new History(CURR_MASTER_INDEX.id, CURR_BASE_SOURCE.id, CURR_MASTER_SOURCE.id)

    try {
        // 1.0 => PARSE, VERIFY DATA TO UPDATE (PROPERTY OR LAYER CHANGES!)
        // 1.1 VERIFY / REJECT UDPATES
        updates.forEach((parcel) => {
            if (History.validator(parcel) && CURR_MASTER_INDEX.features[parcel.parcelNum]) {
                const logEntry = new HistoryEntry({ name: `Parcel: ${parcel.parcelNum}`, type: 'Property', action: 'verified', item: parcel });
                historyEntry.verifiedProps.push(logEntry);   
            }
            else {
                const err = History.validator.errors;
                console.log(err, "checking validator err 64")
                const logEntry = new HistoryEntry({ name: `Parcel: ${parcel?.parcelNum || "unknown"}`, type: 'Property', action: 'rejected', item: parcel, details: { errors: err ?? "Likely: Parcel Num not in Master Idx"}});
                historyEntry.rejectedProps.push(logEntry);
                History.validator.errors = null;
            }
        });

        // 1.2 TRACK DIFFERENCES IN LAYERS
        const [removedBaseLayers,   addedBaseLayers  ] = diffLayers(CURR_BASE_SOURCE.layers,   NEW_BASE_SOURCE_LAYERS)
        const [removedMasterLayers, addedMasterLayers] = diffLayers(CURR_MASTER_SOURCE.layers, NEW_MASTER_SOURCE_LAYERS);

        historyEntry.layerChanges.push(...[
            removedBaseLayers  .length ? new HistoryEntry({ name: "All Base Layers",   type: 'Base Layers',   action: 'removed', item: removedBaseLayers   .map(layer => layer.name) }) : null,
            addedBaseLayers    .length ? new HistoryEntry({ name: "All Base Layers",   type: 'Base Layers',   action: 'added',   item: addedBaseLayers     .map(layer => layer.name) }) : null,
            removedMasterLayers.length ? new HistoryEntry({ name: "All Master Layers", type: 'Master Layers', action: 'removed', item: removedMasterLayers .map(layer => layer.name) }) : null,
            addedMasterLayers  .length ? new HistoryEntry({ name: "All Master Layers", type: 'Master Layers', action: 'added',   item: addedMasterLayers   .map(layer => layer.name) }) : null,
        ].filter(Boolean));
        
        // 1.3 TRACK DIFFERENCES IN LAYER PROPERTIES FOR BASE / MASTER SOURCE
        const [rmvdBaseFeatureProps,   addedBaseFeatureProps   ] = diffFeatureProperties(CURR_BASE_SOURCE.features[0],   new BaseCollectionFeature());
        const [rmvdMasterFeatureProps, addedMasterFeatureProps ] = diffFeatureProperties(CURR_MASTER_SOURCE.features[0], new MasterCollectionFeature());

        historyEntry.featurePropChanges.push(...[
            rmvdBaseFeatureProps   .length ? new HistoryEntry({ name: 'Base Layer Properties',   type: 'Base Layer Properties',   action: 'removed', item: rmvdBaseFeatureProps })    : null,
            addedBaseFeatureProps  .length ? new HistoryEntry({ name: 'Base Layer Properties',   type: 'Base Layer Properties',   action: 'added',   item: addedBaseFeatureProps })   : null,
            rmvdMasterFeatureProps .length ? new HistoryEntry({ name: 'Master Layer Properties', type: 'Master Layer Properties', action: 'removed', item: rmvdMasterFeatureProps })  : null,
            addedMasterFeatureProps.length ? new HistoryEntry({ name: 'Master Layer Properties', type: 'Master Layer Properties', action: 'added',   item: addedMasterFeatureProps }) : null,
        ].filter(Boolean));

        // ** IF NO CHANGES -> DO NOTHING **
        if (historyEntry.rejectedProps.length       === 0 && 
            historyEntry.verifiedProps.length       === 0 &&
            historyEntry.layerChanges.length        === 0 &&
            historyEntry.featurePropChanges.length  === 0) 
            return;


        // 4.0 => IMPLEMENT UPDATES && GENERATE NEW FILES
        // 4.1 ADMINISTER PARCEL UPDATES
        for (const update of updates) {
            const key = update.parcelNum;
            const feature = CURR_MASTER_INDEX.features[key];

            if (!feature) continue;

            const mergedProps = mergeParcelProperties(feature.properties, update);

            CURR_MASTER_INDEX.features[key].properties = mergedProps;
        }

        // 4.2 GENERATE NEW SOURCES / INDEX
        for (const [key, parcel] of Object.entries(CURR_MASTER_INDEX.features)) {
            
            // GENERATE BASE COLLECTION / FEATURES / LAYERS
            const newBaseFeature = new BaseCollectionFeature(parcel);
            NEW_BASE_SOURCE_COLLECTION.features.push(newBaseFeature);

            for (const layer of NEW_BASE_SOURCE_LAYERS) {
                const value = parcel[layer.key];
                const isValid = (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && !isNaN(value));  

                // skip two core layers => parcels and outline
                if (["parcels", "outline"].includes(layer.key)) {
                    layer.binCount[layer.key] = (layer.binCount[layer.key] || 0) + 1;
                    continue;
                }

                if (isValid) {
                    if (layer.dataType === "category") {
                        layer.binValues.add(value);
                        layer.binCount[value] = (layer.binCount[value] || 0) + 1;
                    }

                    if (layer.dataType === "range") {
                        const current = layer.binValues.get(value) || 0;
                        layer.binValues.set(value, current + 1);
                    }
                }
            }
            
            // GENERATE MASTER COLLECTION / FEATURES / LAYERS
            const newMasterFeature = new MasterCollectionFeature(parcel);
            NEW_MASTER_SOURCE_COLLECTION.features.push(newMasterFeature)

            for (const layer of NEW_MASTER_SOURCE_LAYERS) {
                const value = parcel[layer.key];
                const isValid = (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && !isNaN(value)); 
                
                if (isValid) {
                    if (layer.dataType === "category") {
                        layer.binValues.add(value);
                        layer.binCount[value] = (layer.binCount[value] || 0) + 1;
                    }

                    if (layer.dataType === "range") {
                        const current = layer.binValues.get(value) || 0;
                        layer.binValues.set(value, current + 1);
                    }
                }
            }
            
            // GENERATE MASTER INDEX && FEATURES
            const newIndexFeature = new MasterIndexFeature(parcel)
            NEW_MASTER_INDEX.features[parcel.parcelNum] = newIndexFeature;
            NEW_MASTER_INDEX.length += 1;
            
        }

		// 4.3 SET LAYER FORMULAS FOR BASE COLLECTION
		for (const layer of NEW_BASE_SOURCE_LAYERS) {
            if (layer.dataType === "category") {
                layer.binValues = Array.from(layer.binValues);
            } else if (layer.dataType === "range") {

                const expanded = [];
                for (const [value, count] of layer.binValues.entries()) {
                    for (let i = 0; i < count; i++) {
                        expanded.push(value);
                    }
                }
                
                expanded.sort((a, b) => a - b);
                const { bins, counts } = Layer.generateBins(expanded);
                layer.binValues = bins;   // the bin ranges: [[min, max], ...]
                layer.binCount  = counts; // number of items in each bin
            }

            layer.formulas = Layer.buildLayerFormulas(layer);
		}

		NEW_BASE_SOURCE_COLLECTION.layers = NEW_BASE_SOURCE_LAYERS;


		// SET LAYER FORMULAS FOR MASTER COLLECTION
		for (const layer of NEW_MASTER_SOURCE_LAYERS) {
            if (layer.dataType === "category") {
                layer.binValues = Array.from(layer.binValues);
            } else if (layer.dataType === "range") {

                const expanded = [];
                for (const [value, count] of layer.binValues.entries()) {
                    for (let i = 0; i < count; i++) {
                        expanded.push(value);
                    }
                }
                
                expanded.sort((a, b) => a - b);
                const { bins, counts } = Layer.generateBins(expanded);
                layer.binValues = bins;   // the bin ranges: [[min, max], ...]
                layer.binCount  = counts; // number of items in each bin
            }

            layer.formulas = Layer.buildLayerFormulas(layer);
		}

        // // 5.0 => WRITE NEW PRODUCTION FILES
        await writeJsonFile(NEW_MASTER_INDEX,             masterIdxProdDir,   'master-index.json');
        await writeJsonFile(NEW_MASTER_SOURCE_COLLECTION, masterSrcBackupDir, 'master-source.json');
        await writeJsonFile(NEW_MASTER_SOURCE_COLLECTION, mapSourceProdDir,   'master-source.json');
        await writeJsonFile(NEW_BASE_SOURCE_COLLECTION,   baseSrcBackupDir,   'base-source.json');
        await writeJsonFile(NEW_BASE_SOURCE_COLLECTION,   mapSourceProdDir,   'base-source.json');

        // 6.0 => APPEND HISTORY ENTRY
        try {
            await appendJsonLine(historyEntry, historyDir, 'history.jsonl');
        } catch (logErr) {
            console.warn("Failed to write history log:", logErr.message);
        }

    } catch (err) {
        console.warn("Error during updateIndexAndAssets:", err);

        const requiredFiles = [
            { name: 'master-index.json',  paths: [masterIdxProdDir, masterIdxBackupDir] },
            { name: 'master-source.json', paths: [mapSourceProdDir, masterSrcBackupDir] },
            { name: 'base-source.json',   paths: [mapSourceProdDir, baseSrcBackupDir]   },
        ];

        const missingFileRecords = [];

        for (const { name, paths } of requiredFiles) {
            const fileExistsInAny = await Promise.all(paths.map(async dir => {
                try {
                    await fs.access(path.join(dir, name));
                    return true;
                } catch {
                    return false;
                }
            }));

            if (!fileExistsInAny.includes(true)) {
                missingFileRecords.push({ file: name, checkedPaths: paths });
            }
        }

        const error = { message: err.message, stack: err.stack };
        const fallbackCheck = { missingFiles: missingFileRecords };
        const failureEntry = new HistoryEntry({ name: "FAIL", type: "FAILURE IN UPDATE PROCESS", action: "LOG FAILURE, ENSURE BACKUPS", item: {error, fallbackCheck}   });
        historyEntry.failure.push(failureEntry);

        try {
            await appendJsonLine(historyEntry, historyDir, 'history.jsonl');
            console.log("Fallback error log written.");
        } catch (logErr) {
            console.warn("Failed to write fallback history log:", logErr.message);
        }
    }
}

function diffLayers(oldLayers, newLayers) {
    const oldKeySet = new Set(oldLayers.map(layer => layer.key));
    const newKeySet = new Set(newLayers.map(layer => layer.key));

    const added = newLayers.filter(layer => !oldKeySet.has(layer.key));
    const removed = oldLayers.filter(layer => !newKeySet.has(layer.key));

    return [removed, added];
}

function diffFeatureProperties(oldFeature, newFeature) {
    if (!oldFeature || !newFeature) return [[], []];

    const oldProps = oldFeature.properties || {};
    const newProps = newFeature.properties || {};

    const oldKeys = new Set(Object.keys(oldProps));
    const newKeys = new Set(Object.keys(newProps));

    const removed = [...oldKeys].filter(key => !newKeys.has(key));
    const added   = [...newKeys].filter(key => !oldKeys.has(key));

    return [removed, added];
}

async function writeJsonFile(data, dir, filename) {
    const fullPath = path.join(dir, filename);
    await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf8');
}

async function appendJsonLine(data, dir, filename) {
    const fullPath = path.join(dir, filename);
    const line = JSON.stringify(data) + "\n";
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(fullPath, line);
}

async function loadAndBackupJson(dir, filename, backupSuffix = '.backup.json') {
	const currPath = path.join(dir, filename);
	const backupPath = path.join(dir, filename.replace(/\.json$/, backupSuffix));

	try {
		// 1. Try to load current file
		const fileData = await fs.readFile(currPath, 'utf-8');
		const jsonData = JSON.parse(fileData);

		// 2. Delete old backup if it exists
		try {
			await fs.unlink(backupPath);
		} catch (err) {
			if (err.code !== 'ENOENT') throw err;
		}

		// 3. Rename current file to backup
		await fs.rename(currPath, backupPath);

		// 4. Return loaded data
		return jsonData;

	} catch (err) {
		if (err.code === 'ENOENT') {
			console.warn(`Primary file not found. Attempting to load backup: ${backupPath}`);
			try {
				const backupData = await fs.readFile(backupPath, 'utf-8');
				return JSON.parse(backupData);
			} catch (backupErr) {
				console.error(`Backup file also missing or unreadable: ${backupPath}`);
				throw backupErr;
			}
		} else {
			console.error('Error in loadAndBackupJson:', err);
			throw err;
		}
	}
}

function mergeParcelProperties(oldProps = {}, newProps = {}) {
    const merged = {};

    // Union of all keys from both objects
    const keys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);

    for (const key of keys) {
        const newVal = newProps[key];
        const oldVal = oldProps[key];

        merged[key] = newVal ? newVal : (oldVal ? oldVal : null);
    }

    return merged;
}