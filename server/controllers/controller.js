const controller = {};
const apiKey = "AIzaSyArkv_B14HtFM54IbcygLMLwVY3PGQYjRI";
const axios = require("axios");
const { string, number } = require("prop-types");
const fs = require("fs/promises");
const path = require("path");
const { now } = require("mongoose");
const { nextTick } = require("process");
const stateCodeMapping = require("../models/states.json")

controller.parseDirections = async (req, res, next) => { };
// distance.value given in meters 1 mile to 1609.34 meters

// async call to api to get the total distance and amount of 'steps' for the total trip
controller.getSteps = async (req, res, next) => {
  const { originCity, destinationCity, originState, destinationState, mpg } =
    req.query;
  try {
    const getDirectionsResponse = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${originCity}+%2C%20+${originState}&destination=${destinationCity}+%2C%20+${destinationState}&key=${apiKey}`
    );
    res.locals.distance =
      getDirectionsResponse.data.routes[0].legs[0].distance.text; // <-- total in meters is .value, .text is miles
    // res.locals.steps = getDirectionsResponse.data.routes[0].legs[0].steps;
    //console.log('distance', res.locals.distance);
    res.locals.mpg = mpg;
    res.locals.originState = originState;
    // returns array of steps and total distance
    return next();
  } catch (err) {
    console.log("err in getSteps", err);
    return next(err);
  }
};

// const getState = async (lng, lat, next) => {
//   // takes lat long and returns state code
//   try {
//     const getStateCode = await axios.get(
//       `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=administrative_area_level_1&key=${apiKey}`
//     );
//     return getStateCode.data.results[0].address_components[0].short_name; // <-- e.g.,'NY'
//   } catch (err) {
//     next(err);
//   }
// };

controller.refreshPrices = async () => {
  const SUCCESS_CACHED_DATA = -1;
  const SUCCESS_REFRESH_DATA = 1;
  const FAIL_ERR = -2;

  try {
    // Fetch the date of the last time data was refreshed
    const checkLastRefreshDate = await fs.readFile(
      path.join(__dirname, "../models/tinyDb.json"),
      "utf-8"
    );
    const parsedRefreshDate = JSON.parse(checkLastRefreshDate);
    const lastUpdated = parsedRefreshDate.lastUpdated;

    // Setting variables for the date on this function call and a date which represents the latest an API call can have been made previously
    const today = new Date();
    const todayLessThree = new Date().setDate(today.getDate() - 3);

    // Declaring some variables in outer execution context for ease of reference in other functions
    let gasPricesUSA;
    const stateGasPrices = {
      lastUpdated: today,
      stateGasPrices: {},
    };

    // Validate that 3 days have passed since the last fetch so as to be respectful of the API rate limit
    // return value of -1 will represent that things are functioning, but it is not time to make another call
    if (Date.parse(lastUpdated) > todayLessThree)
      return SUCCESS_CACHED_DATA;
    else {
      gasPricesUSA = await axios.get(
        "https://api.collectapi.com/gasPrice/allUsaPrice",
        {
          headers: {
            "content-type": "application/json",
            authorization:
              "apikey 5bwVFhyTRby5HMfdnOrPUr:3IEvZDddbEjTGlcAGJiMcK",
          },
        }
      );

      // Fill an object with the gasPrice API objects (with state names and gas prices) organized by 2-letter state name
      // stateCodeMapping is an object where each property has a key of a full state name, which has a value of the corresponding 2-letter
      for (let i = 0; i < (gasPricesUSA.data.result.length); i++) {
        stateGasPrices.stateGasPrices[
          stateCodeMapping[gasPricesUSA.data.result[i].name]
        ] = gasPricesUSA.data.result[i];
      }
    }

    // write the new object with state 2-letter names and gasPrice objects to tinyDb locally on the server
    await fs.writeFile(
      path.join(__dirname, "../models/tinyDb.json"),
      JSON.stringify(stateGasPrices),
      "utf-8"
    );

    // return value of 1 to show that the new information was pulled successfully;
    return SUCCESS_REFRESH_DATA;
  } catch (err) {
    // if error, log to the console
    console.log("There was an error in the refreshPrices function: ", err);

    // return -2 to show that there was an error running this function
    return FAIL_ERR;
  }
};

// Console logs for the refreshPrices function to test
// const testVal = controller.refreshPrices()
//   .then(res => console.log(res));

controller.getPrice = async (req, res, next) => {
  // FROM FRONT-END: MPG, START STATE
  // FROM RES.LOCALS: DISTANCE
  // API REQ: GET PRICE/GAL BASED ON STATE
  // ----> CALCULATE: DISTANCE/MPG * PRICE/GAL

  // using await because refreshPrices is an async function, which returns a promise, the resolution of which we want to wait for
  const refreshGasPricesStatusCode = await controller.refreshPrices();

  const { mpg, originState, distance } = res.locals;

  const distanceNum = Number(distance.match(/[0-9]/gm).join(""));

  try {
    // const state = await getState(initLng, initLat);
    // Read-in the gasPrices object from tinyDb on local storage
    let gasPriceObj = await fs.readFile(
      path.join(__dirname, "../models/tinyDb.json"),
      "utf-8"
    );

    // parse gas prices object retrieved from tinyDb
    let gasPriceParsed = JSON.parse(gasPriceObj);
    let gasPrice = gasPriceParsed.stateGasPrices[originState].gasoline;

    // console.log('gasPrice', await gasPrice);
    // ----> CALCULATE: DISTANCE/MPG * PRICE/GAL
    res.locals.totalPrice = (distanceNum / Number(mpg)) * (gasPrice);
    // console.log('totalPrice', res.locals.totalPrice);

    return next();
  } catch (err) {
    console.log("err in getNearbyGas in getPrice controller", err);
    return next(err);
  }
};

module.exports = controller;
