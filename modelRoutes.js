var temp = require('temp').track();
var multer = require('multer');
var path = require('path');
var makeRandomString = require('./lib/stringUtil').makeRandomString

var tempDir;
temp.mkdir('uploads', function(err, dirPath) {
	if (err)
		throw err;
	tempDir = dirPath;
});

function requireAdminUser(req, res, next) {
	if (req.user && req.user.isAdmin)
		return next()

	res.sendStatus(401)
}

module.exports = 
function modelRoutes(
	app,
	gfs,
	mongoConnection,
	passportConf
){
	// ----- MODEL ROUTES

	// Asset controllers
	var AssetController = require('./controllers/assetController');
	var GraphController = require('./controllers/graphController');
	var ImageController = require('./controllers/imageController');
	var SceneController = require('./controllers/sceneController');
	var PatchController = require('./controllers/patchController');

	var AssetService = require('./services/assetService');
	var GraphService = require('./services/graphService');

	var EditLogController = require('./controllers/editLogController');
	var editLogController = new EditLogController()

	var DocumentationController = require('./controllers/documentationController');
	var documentationController = new DocumentationController();

	var graphController = new GraphController(
		new GraphService(require('./models/graph'), gfs),
		gfs,
		mongoConnection
	);

	var imageController = new ImageController(
		new AssetService(require('./models/image')),
		gfs
	);

	var sceneController = new SceneController(
		new AssetService(require('./models/scene')),
		gfs
	);

	var AudioModel = require('./models/audio');
	var audioController = new AssetController(
		AudioModel,
		new AssetService(AudioModel),
		gfs
	);

	var VideoModel = require('./models/video');
	var videoController = new AssetController(
		VideoModel,
		new AssetService(VideoModel),
		gfs
	);

	var patchController = new PatchController(
		new AssetService(require('./models/patch')),
		gfs
	);

	var JsonModel = require('./models/json');
	var jsonController = new AssetController(
		JsonModel,
		new AssetService(JsonModel),
		gfs
	);

	var controllers = {
		graph: graphController,
		image: imageController,
		scene: sceneController,
		audio: audioController,
		video: videoController,
		json: jsonController,

		patch: patchController
	}

	function getController(req, res, next) {
		req.controller = controllers[req.params.model];
		next();
	}

	function requireController(req, res, next) {
		req.controller = controllers[req.params.model];
		if (!req.controller) {
			var e = new Error('Not found: '+req.path);
			e.status = 404;
			return next(e);
		}
		next();
	}

	function expectUploadedFile(req, res, next) {
		var file = req.files.file

		if (!file) {
			var e = new Error('Please upload an image')
			e.status = 400
			return next(e)
		}

		next()
	}

	// upload user profile avatar picture
	app.post('/account/profile/avatar',
		passportConf.isAuthenticated,
		multer({
			dest: tempDir,
			limits: {
				fileSize: 1024 * 1024 * 8 // 8m
			},
			rename: function (fieldname, filename) {
				return filename.replace(/\W+/g, '-');
			}
		}),
		expectUploadedFile,
		imageController.setUserAvatar.bind(imageController))

	// upload user profile header picture
	app.post('/account/profile/header',
		passportConf.isAuthenticated,
		multer({
			dest: tempDir,
			limits: {
				fileSize: 1024 * 1024 * 8 // 8m
			},
			rename: function (fieldname, filename) {
				return filename.replace(/\W+/g, '-');
			}
		}),
		imageController.setUserHeader.bind(imageController))


	// upload
	app.post('/upload/:model',
		requireController,
		passportConf.isAuthenticated,
		multer({
			dest: tempDir,
			limits: {
				fileSize: 1024 * 1024 * 128 // 128m
			},
			rename: function (fieldname, filename) {
				return filename.replace(/\W+/g, '-');
			}
		}),
		expectUploadedFile,
		function(req, res, next) {
			// imageProcessor will checksum the file
			if (req.params.model === 'image')
				return next()

			req.controller.checksumUpload(req, res, next)
		},
		function(req, res, next) {
			req.controller.canWriteUpload(req, res, next)
		},
		function(req, res, next) {
			req.controller.upload(req, res, next)
		}
	);

	// anonymous upload, no auth required
	app.post('/uploadAnonymous/:model',
		requireController,
		multer({
			dest: tempDir,
			limits: {
				fileSize: 1024 * 1024 * 128 // 128m
			},
			rename: function (fieldname, filename) {
				// Rename the file to a random string
				var randomStr = makeRandomString(12);
				var fileExt = path.extname(filename);
				var newName = randomStr + fileExt;

				return newName;
			}
		}),
		expectUploadedFile,
		function(req, res, next) {
			// imageProcessor will checksum the file
			if (req.params.model === 'image')
				return next()

			req.controller.checksumUpload(req, res, next)
		},
		function(req, res, next) {
			req.controller.canWriteUploadAnonymous(req, res, next)
		},
		function(req, res, next) {
			req.controller.uploadAnonymous(req, res, next)
		}
	);

	// -----
	// Admin
	app.get('/admin/list', 
		requireAdminUser,
		function(req, res, next) {
			graphController.adminIndex(req, res, next)
		}
	)

	// -----
	// Edit Log routes
	app.get('/editlog', function(req, res, next) {
		return editLogController.userIndex(req, res, next)
	})

	app.get('/editlog/:channelName', function(req, res, next) {
		return editLogController.show(req, res, next)
	})

	app.post('/editlog/:channelName', function(req, res, next) {
		return editLogController.save(req, res, next)
	})

	app.post('/editlog/:channelName/join', function(req, res, next) {
		return editLogController.join(req, res, next)
	})

	// -----
	// User Patch routes
	app.get('/:username/patches', function(req, res, next) {
		patchController.findByCreatorName(req, res, next);
	})

	app.post('/:username/patches', function(req, res, next) {
		patchController.save(req, res, next);
	})

	// -----
	// Graph routes

	// save, anonymous
	app.post('/:model/v',
		requireController,
		function(req, res, next) {
			req.user = {
				username: 'v'
			}

			if (req.params.model === 'graph')
				return req.controller.saveAnonymous(req, res, next)
			
			req.controller.uploadAnonymous(req, res, next)
		}
	)

	app.get(['/editor', '/edit'], graphController.edit.bind(graphController));

	// GET /embed/fthr/dunes-world -- EMBED
	app.get('/embed/:username/:graph', function(req, res, next) {
		req.params.path = '/'+req.params.username+'/'+req.params.graph;
		graphController.embed(req, res, next);
	});

	// GET /fthr/dunes-world/edit -- EDITOR
	app.get('/:username/:graph/edit', function(req, res, next) {
		req.params.path = '/'+req.params.username+'/'+req.params.graph;
		graphController.edit(req, res, next);
	});

	// GET /fthr/dunes-world.json
	app.get('/:username/:graph.json', function(req, res, next) {
		req.params.path = '/'+req.params.username+'/'+req.params.graph.replace(/\.json$/g, '');
		graphController.load(req, res, next);
	});

	// GET /fthr/dunes-world -- PLAYER
	app.get('/:username/:graph', function(req, res, next) {
		req.params.path = '/'+req.params.username+'/'+req.params.graph
		graphController.graphLanding(req, res, next)
	})

	// POST /fthr/dunes-world -- USERPAGE
	app.post('/:username/:graph',
		passportConf.isAuthenticated,
		function(req, res, next) {
			req.params.path = '/'+req.params.username+'/'+req.params.graph
			graphController.graphModify(req, res, next)
		})

	// DELETE /fthr/dunes-world
	app.delete('/:username/:graph', 
		passportConf.isAuthenticated,
		function(req, res, next) {
			req.params.path = '/'+req.params.username+'/'+req.params.graph
			graphController.delete(req, res, next)
		})

	// GET /fthr/dunes-world/graph.json
	app.get('/:username/:graph/graph.json', function(req, res, next) {
		req.params.path = '/'+req.params.username+'/'+req.params.graph.replace(/\.json$/g, '');
		graphController.stream(req, res, next);
	});

	// ----
	// Documentation
	app.get('/docs/plugins/:pluginName', function(req, res, next) {
		documentationController.getPluginDocumentation(req, res, next);
	});

	// ----
	// Metadata on images
	app.get(/^\/meta\/data\/.*/, function(req, res, next) {
		imageController.getMetadata(req, res, next);
	})


	// -----
	// Generic model routes

	// latest ("I'm feeling lucky")
	app.get('/graph/latest', function(req,res,next) {
		graphController.latest(req, res, next)
	})

	// discovery
	app.get(['/browse', '/graphs', '/browse.json'], function(req, res, next) {
		graphController.publicRankedIndex(req, res, next)
	})

	// list own assets
	app.get('/:model', getController, function(req, res, next) {
		if (!req.controller)
			return graphController.userIndex(req, res, next)

		requireController(req, res, function(err) {
			if (err)
				return next(err)

			return req.controller.userIndex(req, res, next)
		})
	})

	// list user assets
	app.get(['/:username/assets/:model', '/:username/assets/:model.json'], getController, function(req, res, next) {
		requireController(req, res, function(err) {
			if (err)
				return next(err)

			return req.controller.userIndex(req, res, next)
		})
	})

	// list by tag for user
	app.get('/:username/assets/:model/tag/:tag', requireController, function(req, res, next) {
		req.controller.findByTagAndUsername(req, res, next)
	})

	// list by tag for current user
	app.get('/:model/tag/:tag',
		requireController, 
		function(req, res, next) {
			if (!req.user || !req.user.username)
				return res.json([])

			req.params.username = req.user.username;
			req.controller.findByTagAndUsername(req, res, next)
		})

	// get
	app.get('/:model/:id', requireController, function(req, res, next) {
		req.controller.load(req, res, next)
	})

	// save
	app.post('/:model',
		requireController,
		passportConf.isAuthenticated,
		function(req, res, next) {
			req.controller.save(req, res, next)
		}
	)

	// last resort Graph URLs

	// GET /ju63
	app.get('/:path', function(req, res, next) {
		req.params.path = '/'+req.params.path
		graphController.edit(req, res, next)
	})

}
