'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());

function handleError(err, res) {
    console.error(err);
    if (res) res.status(500).send('Sorry, something went wrong');
}

app.listen(PORT, () => console.log(`App is listening on ${PORT}`));

//paths
app.get('/location', searchToLatLong);
app.get('/weather', getWeather);
app.get('/events', getEvents);

//models
function Location(locationQuery, locationInfo) {
    this.search_query = locationQuery;
    this.formatted_query = locationInfo.results[0].formatted_address;
    this.latitude = locationInfo.results[0].geometry.location.lat;
    this.longitude = locationInfo.results[0].geometry.location.lng;
}

function Weather(day) {
    this.forecast = day.summary;
    this.time = new Date(day.time * 1000).toDateString().slice(0, 15);
}

function Event(eventInfo) {
    this.link = eventInfo.url;
    this.name = eventInfo.name.text;
    this.event_date = new Date(eventInfo.start.local * 1000).toDateString().slice(0, 15);
    this.summary = eventInfo.summary;
}


//get info
function searchToLatLong(request, response) {
    const locationQuery = request.query.data;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${locationQuery}&key=${process.env.GEOCODE_API_KEY}`;

    superagent.get(url)
        .then(apiResponse => {
            const location = new Location(locationQuery, apiResponse.body);
            response.send(location);
        })
        .catch(error => handleError(error, response));
}

function getWeather(request, response) {
    const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.latitude}`;

    superagent.get(url)
        .then(apiResponse => {
            const dailyWeather = apiResponse.body.daily.data.map(day => new Weather(day));
            response.send(dailyWeather);
        })
        .catch(error => {
            console.error(error);
            response.send("something went wrong");
        });
}

function getEvents(request, response) {
    const url = `https://www.eventbrite.com/v3/events/search?token=${process.env.EVENTBRITE_OAuTH_TOKEN}&location.address=${request.query.data.formatted_query}`;

    superagent.get(url)
        .then(apiResponse => {
            console.log('event data', apiResponse.body.events[0]);
            response.send('blah')
            // const events = apiResponse.body.events.map(eventData => {
            //     const event = new Event(eventData);
            //     return event;
            // })
        })

        .catch(error => handleError(error, response));
}

