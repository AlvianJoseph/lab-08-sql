'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());

function handleError(err, res) {
    console.error(err);
    if (res) res.status(500).send('Sorry, something went wrong');
}

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

app.listen(PORT, () => console.log(`App is listening on ${PORT}`));

//API routes
app.get('/location', getLocationFromSql);
app.get('/weather', getWeatherFromSql);
app.get('/events', getEvents);

//models
function Location(locationQuery, locationInfo) {
    this.search_query = locationQuery;
    this.formatted_query = locationInfo.formatted_address;
    this.latitude = locationInfo.geometry.location.lat;
    this.longitude = locationInfo.geometry.location.lng;
}

function Weather(day) {
    this.forecast = day.summary;
    this.time = new Date(day.time * 1000).toDateString().slice(0, 15);
}

function Event(event) {
    this.link = event.url;
    this.name = event.name.text;
    this.event_date = new Date(event.start.local).toString().slice(0, 15);
    this.summary = event.summary;
}

function getLocationFromSql(request, response) {
    const query = request.query.data;
    const SQL = `SELECT * FROM locations WHERE search_query='${query}';`;
    return client.query(SQL)
        .then(result => {
            if (result.rowCount > 0) {
                console.log('GETTING LOCATION FROM SQL');
                // let sqlLocation = new Location(query, result.rows[0]);
                response.send(result.rows[0]);
            } else {
                fetchLocationFromApi(query, response);
            }
        })
        .catch(error => handleError(error, response));
}

function fetchLocationFromApi(query, response) {
    const _URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
    return superagent.get(_URL)
        .then(data => {
            console.log('GETTING LOCATION FROM API');
            if (!data.body.results.length) { throw 'No Data'; }
            else {
                const location = new Location(query, data.body.results[0]);
                const NEWSQL = `INSERT INTO locations (search_query,formatted_query,latitude,longitude) VALUES($1,$2,$3,$4);`;
                const newValues = Object.values(location);
                return client.query(NEWSQL, newValues)
                    .then(() => response.send(location))
            }
        });
}

function getWeatherFromSql(request, response) {
    const SQL = `SELECT * FROM weathers WHERE location_id=${request.query.data.id};`;
    return client.query(SQL)
        .then(result => {
            if (result.rowCount > 0) {
                console.log('GETTING WEATHER FROM SQL');
                response.send(result.rows[0]);
            } else {
                console.log('GETTING WEATHER FROM API');
                fetchWeatherFromApi(request, response);
            }
        })
        .catch(error => handleError(error));
}

function fetchWeatherFromApi(request, response) {
    const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

    superagent.get(url)
        .then(apiResponse => {
            const dailyWeather = apiResponse.body.daily.data.map(day => new Weather(day));
            const SQL = `INSERT INTO weathers (forecast,time,location_id) 
                        VALUES ('${dailyWeather.forecast}','${dailyWeather.time}',${request.query.data.id});`;
            client.query(SQL);
            response.send(dailyWeather);

        })
        .catch(error => handleError(error));

}

function getEvents(request, response) {
    const url = `https://www.eventbriteapi.com/v3/events/search?token=${process.env.EVENTBRITE_API_KEY}&location.address=${request.query.data.formatted_query}`;

    superagent.get(url)
        .then(result => {
            const events = result.body.events.map(eventData => {
                const event = new Event(eventData);
                return event;
            });

            response.send(events);
        })
        .catch(error => handleError(error, response));
}
