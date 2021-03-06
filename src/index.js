const express = require('express')
const app = express()
const port = 3000
const host = '0.0.0.0'

app.get('/', (req, res) => {
    res.send('Hello from Devops Lifecycle Playground!')
})

// Basic implementation of healthcheck RFC https://tools.ietf.org/id/draft-inadarei-api-health-check-05.html
app.get('/.health', (req, res) => {
    res.json({'status': 'pass'})
})

var cats = require('./cats')
app.use('/cats', cats.router)

app.listen(port, host, () => {
    console.log(`Example app listening at http://${host}:${port}`)
})
