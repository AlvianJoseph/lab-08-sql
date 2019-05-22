'use strict';

//----------------Define Dependencies------------------------//
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());

//----------------Connect to Database------------------------//
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

//----------------Define Routes------------------------//
app.get('/location', getLocationFromDatabase);
app.get('/weather', getWeatherFromDatabase);
app.get('/events', getEventFromDatabase);
app.get('/movies', getMoviesFromDatabase);
app.get('/yelp', getYelpFromDatabase);
app.get('/trails', getTrailsFromDatabase);

//------------------Cache Timeouts------------------//
const timeouts = {
    weather: 15 * 1000,
    yelp: 24 * 1000 * 60 * 60,
    movies: 30 * 1000 * 60 * 60 * 24,
    eventbrite: 6 * 1000 * 60 * 60,
    trails: 7 * 1000 * 60 * 60 * 24
  }

//----------------Create Error Handler------------------------//
function handleError(err, res) {
    console.error(err);
    if (res) res.status(500).send('Sorry, something went wrong');
}

//----------------Models------------------------//
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
    this.summary = event.summary;
    this.event_date = new Date(event.start.local).toString().slice(0, 15);
}

function Yelp(business) {
    this.tableName = 'yelps';
    this.name = business.name;
    this.image_url = business.image_url;
    this.price = business.price;
    this.rating = business.rating;
    this.url = business.url;
    this.created_at = Date.now();
}

function Movie(movie) {
    this.tableName = 'movies';
    this.title = movie.title;
    this.overview = movie.overview;
    this.average_votes = movie.vote_average;
    this.total_votes = movie.vote_count;
    this.image_url = 'https://image.tmdb.org/t/p/w500' + movie.poster_path;
    this.popularity = movie.popularity;
    this.released_on = movie.release_date;
    this.created_at = Date.now();
}

function Trail(trail) {
    this.tableName = 'trails';
    this.name = trail.name;
    this.location = trail.location;
    this.length = trail.length;
    this.stars = trail.stars;
    this.star_votes = trail.starVotes;
    this.summary = trail.summary;
    this.trail_url = trail.url;
    this.conditions = trail.conditionDetails;
    this.condition_date = trail.conditionDate.slice(0, 10);
    this.condition_time = trail.conditionDate.slice(12);
    this.created_at = Date.now();
}

//----------------Request Location Data------------------------//
function getLocationFromDatabase(request, response) {
    const query = request.query.data;
    const SQL = `SELECT * FROM locations WHERE search_query='${query}';`;
    return client.query(SQL)
        .then(result => {
            if (result.rowCount > 0) {
                console.log('GETTING LOCATION FROM SQL');
                response.send(result.rows[0]);
            } else {
                console.log('GETTING LOCATION FROM API')
                fetchLocationFromApi(query, response);
            }
        })
        .catch(error => handleError(error, response));
}

function fetchLocationFromApi(query, response) {
    const _URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
    return superagent.get(_URL)
        .then(apiResponse => {
            const location = new Location(query, apiResponse.body.results[0]);
            const SQL = `INSERT INTO locations (search_query,formatted_query,latitude,longitude) 
                    VALUES($1, $2, $3);`;
            const values = [location.search_query, location.formatted_query, location.latitude];
            client.query(SQL, values);
            response.send(location);
        });
}

//----------------Request Weather Data------------------------//
function getWeatherFromDatabase(request, response) {
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
            const SQL = `INSERT INTO weathers (forecast,time,location_id) VALUES ($1, $2, $3);`;
            const values = [dailyWeather.forecast, dailyWeather.time, request.query.data.id];

            dailyWeather.forEach(function (day) {
                client.query(SQL, values);
            });
            response.send(dailyWeather);
        })
        .catch(error => handleError(error));
}

//----------------Request Events Data------------------------//
function getEventFromDatabase(request, response) {
    const SQL = `SELECT * FROM events WHERE location_id=${request.query.data.id};`;
    return client.query(SQL)
        .then(result => {
            if (result.rowCount > 0) {
                console.log('GETTING EVENT FROM SQL');
                response.send(result.rows[0]);
            } else {
                console.log('GETTING EVENT FROM API');
                fetchEventsFromApi(request, response);
            }
        })
        .catch(error => handleError(error));
}

function fetchEventsFromApi(request, response) {
    const url = `https://www.eventbriteapi.com/v3/events/search?token=${process.env.EVENTBRITE_API_KEY}&location.address=${request.query.data.formatted_query}`;

    superagent.get(url)
        .then(result => {
            const events = result.body.events.map(eventData => new Event(eventData));
            const SQL = `INSERT INTO events (link,name,summary,event_date,location_id) VALUES ($1, $2, $3, $4, $5);`;
            const values = [events.link, events.name, events.summary, events.event_date, request.query.data.id]

            events.forEach(function (event) {
                client.query(SQL, values);
            });
            response.send(events);
        })
        .catch(error => handleError(error, response));
}

//----------------Request Movie Data------------------------//
function getMoviesFromDatabase(request, response) {
    const SQL = `SELECT * FROM movies WHERE location_id=${request.query.data.id};`;
    return client.query(SQL)
        .then(result => {
            if (result.rowCount > 0) {
                console.log('GETTING MOVIE FROM SQL');
                response.send(result.rows[0]);
            } else {
                console.log('GETTING MOVIE FROM API');
                fetchMoviesFromApi(request, response);
            }
        })
        .catch(error => handleError(error));
}

function fetchMoviesFromApi(request, response) {
    const url = `https://api.themoviedb.org/3/search/movie/?api_key=${process.env.MOVIE_API_KEY}&language=en-US&page=1&query=${request.query.data.search_query}`;

    superagent.get(url)
        .then(result => {
            const movies = result.body.results.map(movieData => new Movie(movieData));

            const SQL = `INSERT INTO movies (title, overview, average_votes, total_votes, image_url, popularity, released_on, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`;
            const values = [movies.title, movies.overview, movies.average_votes, movies.total_votes, movies.image_url, movies.popularity, movies.released_on, request.query.data.id];

            movies.forEach(function (movie) {
                client.query(SQL, values);
            });
            response.send(movies);
        })
        .catch(error => handleError(error, response));
}

//----------------Request Trails Data------------------------//
function getTrailsFromDatabase(request, response) {
    const SQL = `SELECT * FROM trails WHERE location_id=${request.query.data.id};`;
    return client.query(SQL)
        .then(result => {
            if (result.rowCount > 0) {
                console.log('GETTING TRAIL FROM SQL');
                response.send(result.rows[0]);
            } else {
                console.log('GETTING TRAIL FROM API');
                fetchTrailsFromApi(request, response);
            }
        })
        .catch(error => handleError(error));
}

function fetchTrailsFromApi(request, response) {
    const url = `https://www.hikingproject.com/data/get-trails?lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&maxDistance=200&key=${process.env.TRAIL_API_KEY}`;

    superagent.get(url)
        .then(result => {
            const trails = result.body.trails.map(trailData => new Trail(trailData));

            const SQL = `INSERT INTO trails (name, location, length, stars, star_votes, summary, trail_url, conditions, condition_date, condition_time, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`;
            const values = [trails.name, trails.location, trails.length, trails.stars, trails.star_votes, trails.summary, trails.trail_url, trails.conditions, trails.condition_date, trails.condition_time, request.query.data.id];

            trails.forEach(function (trail) {
                client.query(SQL, values);
            });
            response.send(trails);
        })
        .catch(error => handleError(error, response));
}

//----------------Request Yelp Data------------------------//
function getYelpFromDatabase(request, response) {
    const SQL = `SELECT * FROM yelps WHERE location_id=${request.query.data.id};`;
    return client.query(SQL)
        .then(result => {
            if (result.rowCount > 0) {
                console.log('GETTING YELP FROM SQL');
                response.send(result.rows[0]);
            } else {
                console.log('GETTING YELP FROM API');
                fetchYelpsFromApi(request, response);
            }
        })
        .catch(error => handleError(error));
}

function fetchYelpsFromApi(request, response) {
    const url = `https://api.yelp.com/v3/businesses/search?location=${request.query.data.search_query}`;

        superagent.get(url)
        .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
            .then(result => {
                const yelps = result.body.businesses.map(yelpData => new Yelp(yelpData));

                const SQL = `INSERT INTO yelps (name, image_url, price, rating, url, location_id) VALUES ($1, $2, $3, $4, $5, $6);`;
                const values = [yelps.name, yelps.image_url, yelps.price, yelps.rating, yelps.url, request.query.data.id];

                yelps.forEach(function (yelp) {
                    client.query(SQL, values);
                });
                response.send(yelps);
            })
            .catch(error => handleError(error, response));
}

app.listen(PORT, () => console.log(`App is listening on ${PORT}`));
