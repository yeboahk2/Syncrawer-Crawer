# syncrawler-crawler

This is the web crawler component of the search engine created for Synchrony Financial and Capstone II. The main functionality is handled in server/crawler.js 

Main funcionality:

  1. scan firebase client database at a set interval and crawl each client website as well as related pages. Update firebase data.
  2. accept new client url and create new firebase entry and script tag for the client.
