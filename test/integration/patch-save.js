var testId = rand()
process.env.MONGODB = 'mongodb://localhost:27017/patch'+testId

var Patch = require('../../models/patch')
var request = require('supertest')
var app = require('../../app.js')
var fs = require('fs')
var fsPath = require('path')
var assert = require('assert')
var expect = require('chai').expect

var graphFile = __dirname+'/../../browser/data/graphs/default.json'
var graphData = fs.readFileSync(graphFile)

function rand() {
	return Math.floor(Math.random() * 10000)
}

describe('Patch', function() {
	var username = 'user'+rand()
	var deets = {
		name: 'Foo Bar',
		username: username,
		email: username+'@test.foo',
		password: 'abcd1234',
		confirmPassword: 'abcd1234'
	}

	var agent = request.agent(app)

	function sendPatch(name, cb) {
		return agent.post('/'+deets.username+'/patches').send({
			name: name,
			graph: graphData
		})
		.expect(200)
		.end(cb)
	}

	before(function(done) {
		app.events.on('ready', function() {
			agent
			.post('/signup')
			.send(deets)
			.expect(302)
			.end(done)
		})
	})

	it('should use the expected name, owner, path, and url', function(done) {
		var name = 'This is a patch'
		var expectedPath = '/'+username+'/patches/this-is-a-patch.json'

		sendPatch(name, function(err, res) {
			if (err) return done(err)
			var json = {
				name: res.body.name,
				url: res.body.url,
				path: res.body.path
			}
  			expect({
				name: name,
				path: expectedPath,
				url: '/data'+expectedPath
			}).to.deep.equal(json)
			done()
		})
	})

	it('should return data by url', function(done) {
		var path = 'button-'+rand()

		sendPatch(path, function(err, res) {
			if (err) return done(err)
			request(app).get(res.body.url)
			.expect(200).end(function(err, res)
			{
				if (err) return done(err)
				assert.equal(res.body.active_graph, 'root')
				done()
			})
		})
	})

	it('should force the right path', function(done) {
		var path = '/blah/quux/bar/foo.png'
		var expectedPath = '/'+username+'/foo.json'

		sendPatch(path, function(err, res) {
			if (err) return done(err)
			expect(res.body.path).to.equal(expectedPath)
			done()
		})
	})

	it('should list user patches', function(done) {
		Patch.remove().exec(function(err) {
			if (err) return done(err)

			sendPatch('Awesomesauce Patch', function(err, res) {
				if (err) return done(err)
				request(app)
				.get('/'+username+'/patches')
				.expect(200).end(function(err, res)
				{
					if (err) return done(err)
					expect(res.body.length).to.equal(1)
					expect(res.body[0].name).to.equal('Awesomesauce Patch')
					done()
				})
			})
		})
	})
})

