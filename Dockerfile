FROM node:16.6.1-alpine3.11

# Create app directory
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --only=production

# Copy app files 
COPY src ./src

EXPOSE 3000
CMD [ "npm", "run", "start" ]
