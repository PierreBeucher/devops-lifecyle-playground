var express = require('express')
var router = express.Router()

// middleware that is specific to this router
router.use(function timeLog (req, res, next) {
  console.log('What will the cat do?')
  next()
})

// define the home page route
router.get('/', function (req, res) {
  res.send('The cat is looking at you with curious eyes...')
})

router.get('/interact/:item', function (req, res) {
  res.send(catInteractWith(req.params.item))
})

function catInteractWith(item){
    switch(item){
        case 'ball':
            return 'The cat is playing with the ball.'
        case 'food':
            return 'The cat is eating the food.'
        case 'cat':
            return 'The cat is fighting with the other cat.'
        default:
            return 'The cat doesn\'t know what to do with that and hid under the furniture.'
    }
}

module.exports = {
  'router': router,
  'catInteractWith': catInteractWith
};