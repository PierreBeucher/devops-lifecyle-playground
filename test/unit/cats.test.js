const cats = require('../../src/cats');

test('cat interact with ball', () => {
  expect(cats.catInteractWith('ball')).toBe('The cat is playing with the ball.');
});

test('cat interact with food', () => {
  expect(cats.catInteractWith('food')).toBe('The cat is eating the food.');
});

test('cat interact with cat', () => {
  expect(cats.catInteractWith('cat')).toBe('The cat is fighting with the other cat.');
});

test('cat interact with unknown', () => {
  expect(cats.catInteractWith('xxx')).toBe('The cat doesn\'t know what to do with that and hid under the furniture.');
});
