const fetch = require('node-fetch');

async function getHealth() {
    const response = await fetch('http://localhost:8080/.health');
  
    if (!response.ok) {
      throw new Error(response.statusText);
    }

    return await response.json();
}

test('healthcheck pass', () => {
    return getHealth().then((data) => {
      expect(data.status).toBe('pass');
    });
});