# MAP.JS

### FILE EXAPLANTION AND HOW TO MAKE CHANGES

**::IMPORTANT::**

**This file is the core of the entire project.**
**This file is the ONLY file that likely could / should have any changes.**
**IF you start to touch another file -> you are most likely going about trying to make a change in the wrong place!!**

By using Classes and built-in methods, a set of standards was built that allow for consistent use of the same strutures and processes to ensure all map related data is handled the same way regardless of being generated from the seed file or updated from the api. The `map.js` file encompasses ALL of the structures and processes to build the datasets and layers to display the information in the mapbox map.

## HOW DOES THIS WORK / ORDER OF OPERATIONS:

The entire point of the map system is to give AltadenaCollective / BuildNotes the ability to display fire related data to its users and potential users. This divides our datasets / map sources into two sets of data. One that represents non-users / no acct, and another data source for when a user is logged in. These two datasets are called `base-source` and `master-source`. 

### `base-source` 
This dataset is used to represent the base information for the map. Upon loading in the map it presents all of the parcels shaded in along with their outlines colored so the individual properties can be seen clearly. It is a starting point. It can also be used to add data and present data that you may want to be able to display publicly / to a user who **does not have an account yet**, but you want to attract them by showing they can access a map feature.

### `master-source`
This dataset is used to represent information you would want to build ON TOP OF the base layers and to show information you want an **account holding user** to be able to see, but NOT an avg / no acct user.

### INIT.JS 
Upon installing the package you will run a command that will take the original datasets, provided by city government, and use that data to produce the initial structures for the `base-source` and `master-source`. At the same time, we introduce a third dataset called `master-index` that is generated from the same exact data used to create the first two items. 

### `master-index`
This serves as a `source-of-truth` dataset that will be altered when there are changes in any of the schemas or items that trigger a change -> and, after updates are applied to the `master-index` -> it is then used to update and rebuild the `base-source` and `master-source`. Repeat: only one dataset is altered/updated based on internal changes or changes passed to the update function. That dataset is then used to then rebuild the two datasets used to display the information on the map. Everything stays in sync.

### `MAP.JS`
This is where map.js comes in. The project was built so that changes could easily be applied by working with the classes inside map.js in order to execute those updates automatically and recalculate layers, bins, formaulas to be able to display those changes. Below is the list of classes in map.js and a brief explanation. After the exaplantions, there are some step x step processes to make changes accordingly.


## `MAP.JS` CLASSES:

- `History`: tracks changes and versions of files used over time.

- `HistoryEntry` object used to standardize shape of data that goes into the `history.jsonl` file.

- `Layer` structure and logic for building layers readable by mapbox.

- `FeatureCollection` structure for building a data `source` to be used in a mapbox map.

- `BaseCollectionFeature`   structure for building an entry for a `Feature Collection` of type `base-source`.

- `MasterCollectionFeature` structure for building an entry for a `Feature Collection` of type `master-source`.

- `MasterIndexFeature` structure for building an entry for the `MasterIndex`.

- `MasterIndex` central structure for updating and applying changes => data, layer, and bin changes.
  - used to build and rebuild the `base` and `master` sources.


## MAKING ADJUSTMENTS

**READ THESE EXAPLANTIONS FIRST!**
**THIS PROVIDES INSTRUCTIONS ON WHAT CAN BE ALTERED SAFELY AND WHAT AFFECT IT WILL HAVE**
**THERE ARE STEP X STEP GUIDES BELOW FOR HOW TO SPECIFICALLY MAKE A CHANGE TO THE SYSTEM.**

- `History`:
  1. Inside of the `History` class is a `static updateParcelSchema` object. This object is used to validate the incoming updates from BuildNotes that are expected to be applied to a parcel / property that is recognized as being in the map dataset. The `master-index` is an object with keys that are eqaul to the parcelNumber of the property in question. **If an incoming update does not have a parcelNum - it must be rejected!**
  2. This validation object (`static updateParcelSchema`) **should be used to enforce the structure of the data for updates wanting to be applied**. As you figure out what new data we want to add to the map - we need to figure out how that data gets added to the map, what format, and validate those formats being added in updates. This will happen over time. BUT - if / when we start accepting specific update information, we need to ensure validation of format so the data can properly be displayed in the mapbox map.

- `HistoryEntry` - **SHOULD NOT BE ALTERED**

- `Layer` - **SHOULD NOT BE ALTERED**

- `FeatureCollection`:
  1. This Class holds two important static methods:
     1. getBaseLayers() 
     2. getMasterLayers()
  2. These two methods decide which layers show up in the different data sources on the map for that data source. **IT MUST HAVE AN ACCOMPANYING PROPERTY IN THE RELATED DATA SOURCE FEATURE IN ORDER TO WORK PROPERLY.**
  **READ ONE OF THE GUIDES BELOW THIS SECTION TO GET A BETTER UNDERSTANDING**

- `BaseCollectionFeature` structure for building an entry for a `Feature Collection` of type `base-source`.
  - If a layer needs to be added to a data source so that it can be displayed - it must have the accompanying information as a property inside the `Feature` class associated with that data source that has the layer being added / removed.

- `MasterCollectionFeature` structure for building an entry for a `Feature Collection` of type `master-source`.
  - If a layer needs to be added to a data source so that it can be displayed - it must have the accompanying information as a property inside the `Feature` class associated with that data source that has the layer being added / removed.

- `MasterIndexFeature`:
  1. Represents a Feature in the MasterIndex 
  2. Is a collection of all data / properties that we want to store and display in relation to the map.
  3. **ANY ONE PROPERTY BEING USED IN A DATA SOURCE (BASE OR MASTER) SHOULD BE STORED IN THE MASTER INDEX FEATURE**
  4. **BECAUSE THE MASTER INDEX AND ITS FEATURES REBUILD BOTH DATA SOURCES - base / master - THE MASTER INDEX MUST ACCOUNT FOR ALL PROPERTIES BEING USED BETWEEN BOTH DATA SETS.. it is the source of truth!**

- `MasterIndex` - **SHOULD NOT BE ALTERED**


## STEP X STEP GUIDES:

### ADDING A BASE SOURCE LAYER OR MASTER SOURCE LAYER
As previously mentioned, the `base-source` is the starting point for the map && the data set / layers that can be used for when a user is not logged in / a non-account holder. The `master-source` is meant to be used on top of the base and from the perspective of being an account holding user.. Specific information they are privy to accessing or viewing. 

To be able to alter (add or remove) a layer from one of the data sources, we need to make two changes:

1. Change the layers in the `FeatureCollection` class. (getBaseLayers() or getMasterLayers())
2. Change the properties in the accompanying FeatureCollectionFeature:
   1. `BaseCollectionFeature`
   2. `MasterCollectionFeature`
   
As long as the property is in the appropriate CollectionFeature.properties object and the new layer has been added with the correct information - the rest of the work is automated. Examples below for altering a base source layer ->

We will add the following layer to the base-source layers:
```js
 { key: "zipCode", name: "Zip Code", src: "base-source", dataType: "category", type: "fill", binValues: new Set(), formulas: [] }, 
```
**NOTICE THE FOLLOWING IMPORTANT ITEMS:**

1. `key`  => name of the property being tracked! It must match the property name in the `FeatureCollectionFeature`!!
2. `name` => The name that will be displayed in the map key to the user.
3. `src`  => the source for the layer to grab its data from (should match the function name and `FeatureCollectionFeature` name!... `base-source`)
4. `dataType`    => three types!
   1. `none`     => determines that binValues do NOT need to be calculated
   2. `category` => determines that data is based on specific unique values consistent throughout the data
      1. Example: The `zipCode` property has a total of ~10 different zip codes that exist throughout the dataset.. These are now fixed categories that represent that data.
   3. `range`    => Non-fixed items - a `range` of numbers -> goes through a calculation process to find the lowest number, the highest number, and generate bines so that the layer can represent different sets of data across that range.
5. `type` => The type determines if we are targetting the **outline** of the parcel (`type: line`) or the filling in of the content with `type: fill`

**MOST OF YOUR LAYERS ARE GOING TO BE OF `dataType: category, type: "fill"`**

```js
// INSIDE FeatureCollection Class:
static getBaseLayers() {
  return [
    // MAKE SURE THE SOURCE SAYS "base-source"! DO NOT REMOVE 'PARCELS' OR 'OUTLINE' 
      // THESE INITIAL TWO LAYERS ARE USED AS THE BASE LINEWORK AND SHADING FOR A SIMPLE MAP
      { key: "parcels",  name: "Parcels", src: "base-source",   dataType: "none",  type: "fill", binValues: new Set(), formulas: [], }, // do not remove this layer!!
      { key: "outline",  name: "Outline", src: "base-source",   dataType: "none",  type: "line", binValues: new Set(), formulas: [], }, // do not remove this layer!!

      // NEW LAYER ADDED:
       { key: "zipCode", name: "Zip Code", src: "master-source", dataType: "category", type: "fill", binValues: new Set(), formulas: [] }, 
  ];
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

            // NEW PROPERTY ADDED SO THAT THE ZIP CODE DATA IS ACCESSIBLE FOR THE LAYER / BINS TO BE BUILT
            zipCode:       parcel?.zipCode     ?? null,
            // THE MASTER INDEX SHOULD CONTAIN ALL PROPERTIES - CAN COPY THAT PROPERTY FROM THERE / PASTE INTO HERE ^^^
        }
    }
}
```

### REMOVING A BASE SOURCE LAYER OR MASTER SOURCE LAYER
This process is the exact opposite and only requires removing the layer in the proper function and removing the property from the `FeatureCollectionFeature`.


```js
// INSIDE FeatureCollection Class:
static getBaseLayers() {
  return [
      // ... OTHER LAYERS HERE
      // REMOVE THIS LINE:
       { key: "zipCode", name: "Zip Code", src: "master-source", dataType: "category", type: "fill", binValues: new Set(), formulas: [] }, 
  ];
}

export class BaseCollectionFeature {
    constructor(parcel) {
        this.type       = "Feature";
        this.geometry   = {
            // ... info here
        },
        this.properties = {
            // ... other properties here
            // REMOVE THIS LINE OF CODE:
            zipCode:       parcel?.zipCode     ?? null,
        }
    }
}
```