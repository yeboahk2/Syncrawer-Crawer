const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const cron = require('node-cron')

const request = require('request')
const cheerio = require('cheerio')
const Url = require('url-parse')
//path?

//CONSTANT  AND GLOBAL VARIABLES
let secondsInterval = 60,
    minutesInterval,
    hoursInterval,
    daysInterval,
    monthsInterval,
    yearsInterval
const MAX_PAGES_TO_VISIT = 4
let url, numPagesVisited, pagesVisited, pagesToVisit, baseUrl


/**************** FIREBASE CONFIGURATION ****************/
var firebase = require('firebase/app')
  require('firebase/firestore')

  var firebaseConfig = {
    apiKey: "AIzaSyAehe_HpVe19yx57VFOAEqtTwMUe5fl5jM",
    authDomain: "syncrawler-storage.firebaseapp.com",
    databaseURL: "https://syncrawler-storage.firebaseio.com",
    projectId: "syncrawler-storage",
    storageBucket: "syncrawler-storage.appspot.com",
    messagingSenderId: "886841567989",
    appId: "1:886841567989:web:edf6c6527aaf9d9ca073bc"
  };
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();
  var clientData = db.collection('clientData')
  /**************** FIREBASE CONFIGURATION ****************/

const app = express()

const port = process.env.port || 3333

app.use(bodyParser.json())
app.use(cors())

app.listen(port, function() {
    console.log("crawler is active on port", port)
    console.log(`Executing 
        every ${secondsInterval||1} second(s)
        every ${minutesInterval||1} minute(s)
        every ${hoursInterval||1} hour(s)
        every ${daysInterval||1} day(s)
        every ${monthsInterval||1} month(s)
        every ${yearsInterval||1} year(s)`)
})


//Function to start a new client
app.post('/new-client', async function (req, res) {
    //TODO: check to see if client url already exists in database
    clientUrl = req.body.clientUrl
    console.log(`RECIEVED NEW CLIENT: ${clientUrl}`)
    clientData.add({
        URL: clientUrl,
        Pages: {
            '/': ""
        }
    }).then(docRef => {
        console.log("created new clientDoc with id: ", docRef.id)
        res.status(200)
        res.send(`<script id="syncrawler" src="http://localhost:3030/search" clientid="${docRef.id}"></script>`)
    }).catch(error => {
        console.log("error: ", error)
        res.status(400)
        res.send("error")
    })
})

/*********************************************************/
/******************** vv SCHEDULER vv ********************/
/*********************************************************/

//cron job here (*second *minute *hour *day *month *year)
cron.schedule(`${`*/${secondsInterval}`||"*"} ` + 
                `${`*/${minutesInterval}`||"*"} ` +
                `${`*/${hoursInterval}`||"*"} ` +
                `${`*/${daysInterval}`||"*"} ` +
                `${`*/${monthsInterval}`||"*"} ` + 
                `${`*/${yearsInterval}`||"*"}`, function() {
    console.log("Running crawler job")

    console.log("Loading data...")
    clientData.get().then(snapshot => {
        clientDocs = snapshot.docs

        clientDocs.forEach(clientDoc => {
            var data = clientDoc.data()
            url = new Url(data.URL)
            console.log("\tHost: " + url.hostname + ", url: " + url.toString())
            
            //initiate crawl
            baseUrl = url.protocol + "//" + url.hostname
            numPagesVisited = 0
            pagesVisited = {}
            pagesToVisit = []
            pagesToVisit.push(url.href)
            if(url.hostname) {
                crawl(clientDoc)
            }
            
        })
    }).catch(err => {
        console.log(err)
    })
    
})

async function crawl(clientDoc) {
    //console.log("new iteration")
    if (numPagesVisited >= MAX_PAGES_TO_VISIT) {
        console.log("\t\t*reached max pages for " + url.hostname + "*")
        return
    }

    if (pagesToVisit.length == 0) {
        return
    }

    var nextPage = pagesToVisit.pop()
    if(nextPage in pagesVisited) {
        //already visited this page so start over
        crawl(clientDoc)
    } else {
        //visit page
        pagesVisited[nextPage] = true
        numPagesVisited++

        //make the request
        console.log("\t\tVisiting page " + nextPage)
        request(nextPage, function(error, response, body) {
            if (error) {
                console.log("\t\t\tresponse rejected...")
            }
            else if (!response) {
                console.log("\t\t\tresponse rejected...")
                crawl(clientDoc)
            }
            //check status code is 200
            //console.log("\t\t\tStatus code: " + response.statusCode)
            else if (response.statusCode != 200) {
                // if the status code isn't 200, move on
                console.log("\t\t\tStatus code was not 200")
                crawl(clientDoc)
            } else {
                //parse the document body
                var $ = cheerio.load(body)
                var pageText = $('html > body').text().toLowerCase()

                //collect links to visit from page
                var links = collectInternalLinks($, url.hostname)
                links.forEach(link => {
                    pagesToVisit.push(baseUrl + link)
                })

                var pageUrl = new Url(nextPage)
                var pathname = pageUrl.pathname

                console.log("\t\t\tTHIS IS THE PATH NAME:" + pathname + ":")

                //update in firebase
                clientDoc.ref.update({
                    Pages: {
                        [pathname]: body
                    }
                }).then (function() {
                    console.log("\t\t\t" + nextPage + " was updated..")
                }).catch(err => {
                    console.log("\t\t\tERROR UPDATING")
                })

                //console.log("reached end")
                crawl(clientDoc)
            }
        })
    }
}

function collectInternalLinks($, host) {
    //get all links on a page that stay within the given domain i.e have the same host
    var allLinks = []

    //relative links will automatically have the same host
    var relativeLinks = $("a[href^='/']")
    relativeLinks.each(function() {
        allLinks.push($(this).attr('href'))
    })

    //absolute links must be checked first then path added
    var absoluteLinks = $("a[href^='http']")
    absoluteLinks.each(function() {
        var link = new Url($(this).attr('href'))
        var linkHost = link.hostname

        if (linkHost == host) {
            var linkPath = link.pathname
            allLinks.push(linkPath)
        }
    })

    console.log("\t\t\tFound " + allLinks.length + " internal links on the page")

    return allLinks
}

//TODO: post to add new client to crawling???