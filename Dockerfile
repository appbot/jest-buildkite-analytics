FROM node:14-alpine

RUN mkdir /app
WORKDIR /app

ENV PATH /app/node_modules/.bin:$PATH

COPY package.json yarn.lock /app/
RUN apk add --no-cache --virtual .gyp python3 make g++

RUN which yarn
RUN yarn install

COPY . /app/
