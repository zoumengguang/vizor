var assert = require('assert')
var fs = require('fs');
var vm = require('vm');
var when = require('when')
var browserPath = __dirname+'/../../';
var EventEmitter = require('events').EventEmitter

var requireRoot = browserPath

var _ = require('lodash')

global.clone = _.cloneDeep.bind(_)

global.Plugin = require(browserPath+'scripts/plugin.js')
global.SubGraphPlugin = require(browserPath+'scripts/subGraphPlugin.js')

global.EventEmitter = require('events').EventEmitter
global.Node = require(browserPath+'scripts/node.js').Node
global.LinkedSlotGroup = require(browserPath+'scripts/node.js').LinkedSlotGroup

exports.slot = function slot(index, type, dt) {
	return {
		index: index,
		type: type,
		dt: dt
	};
}

exports.mockE2Classes = function() {
	global.AssetLoader = function AssetLoader() {
		EventEmitter.call(this)
		this.defaultTexture = { clone: function() {} }
		this.loadingTexture = { clone: function() {} }
	}

	global.AssetLoader.prototype = Object.create(EventEmitter.prototype)
	global.AssetLoader.prototype.loadAsset = function() {
		return when.resolve()
	}

	global.PluginManager = function() {
		this.keybyid = {}
	}
	global.PluginManager.prototype = Object.create(EventEmitter.prototype)
	global.PluginManager.prototype.create = function(id, node) {
		exports.loadPlugin(id)
		var p = new E2.plugins[id](E2.core, node);
		p.id = id
		return p
	}

	global.E2.GraphAnalyser = function() {}
	global.E2.GraphAnalyser.prototype.analyseGraph = function(){
		return when.resolve({ size: 0, numAssets: 0 })
	}

	global.E2.track = function() {}

	global.E2.GridFsClient = function() {}

	global.E2.EnvironmentSettings = function(){}

	global.E2.EnvironmentSettings = function(){}
	global.E2.Noise = function() {this.noise2D = function(){}}
}

function Color() {}
	Color.prototype.setRGB = function(r, g, b) {
		this.r = r
		this.g = g
		this.b = b
	}
	Color.prototype.setHSL = function() {
}

exports.setupThree = function() {
	global.THREE = require(browserPath + 'vendor/three/three.js')
	global.THREE.MorphAnimMesh = function() {}
}

var setupWebVRAdapter = exports.setupWebVRAdapter = function() {
	var mock = function(){}

	if (typeof global.VizorWebVRAdapter === 'undefined') {
		global.VizorWebVRAdapter = function () {
			this.on = this.resizeToTarget = mock
		}
		global.VizorWebVRAdapter.isNativeWebVRAvailable = function () {
			return false
		}
		return
	}

	var vw = global.VizorWebVRAdapter.prototype
	vw.getDomElementDimensions = function() {
		return {width: 220, height: 100, devicePixelRatio:1}
	}
	vw._onManagerModeChanged = function(mode, oldMode){
		this.emit(this.events.modeChanged, mode, oldMode)
	}
	vw.setDomElementDimensions = mock
}

exports.reset = function() {
	global.window = global

	global.window.screen = {width: 1280, height: 720}

	global.addEventListener = function() {}
	global.removeEventListener = function() {}
	global.location = {
		pathname: 'test/test'
	}

	global.Vizor = {}

	global.CustomEvent = function(){}

	function domNode() {
		return {
			src: '',
			style: {},
			addEventListener: global.addEventListener,
			classList: { toggle: function() {}},
			appendChild: function() {},
			dispatchEvent: function() {}
		}
	}

	global.document = {
		addEventListener: global.addEventListener,
		body: domNode(),
		createElement: function() {
			var el = domNode()
			el.setAttribute = function() {}
			return el
		},
		removeEventListener: function() {},
		getElementsByTagName: function() {
			return [ domNode() ]
		},
		querySelector: function() {}
	}

	global.navigator = {
		userAgent: 'node',
		getGamepads: function() {
			return []
		}
	}

	global.WebVRConfig = {
		NO_DPDB_FETCH: true
	}

	global.XMLHttpRequest = function() {
		this.overrideMimeType = function() {}
		this.open = function() {}
		this.addEventListener = function(name, callback) {}
		this.send = function() {}
	}

	exports.runScript(browserPath+'vendor/borismus/webvr-polyfill.js')
	exports.runScript(browserPath+'vendor/borismus/webvr-manager.js')

	exports.runScript(browserPath+'dist/engine.js')
	exports.mockE2Classes()

	global._webVRPolyfill = {
		getVRDisplays: function() { return when.resolve([]) },
	}
	global.hardware = {
		hasVRDisplays: function() { return when.resolve(true) },
	}

	global.VizorWebVRAdapter = require(browserPath+'scripts/webVRAdapter.js')

	var Application = require(browserPath+'scripts/application.js')
	
	E2.core = new Core()

	E2.plugins = {}
	E2.commands = {}

	exports.setupGlobals()

	// throw any errors
	global.msg = function(txt) {
		if (/^ERROR/.test(txt))
			throw new Error(txt)

		console.log.apply(console, arguments)
	}

	function leftTop(){ return { left: 0, top: 0 }}

	global.mat4 = {
		create: function() {},
		identity: function(){}
	}

	global.$ = function() { return {
		length: 1,
		addClass: function(){},
		removeClass: function(){},
		click: function(){},
		text: function(){},
		offset: leftTop,
		position: leftTop,
		css: function(){ return 0 },
		width: function(){ return 0 },
		height: function(){ return 0 },
		position: function(){ return 0 },
		remove: function(){ },
		movable: function(){},
		popover:function(){},
		removeClass:function(){},
		keydown:function(){},
		keyup:function(){},
		mousemove:function(){},
		outerHeight:function(){},
		'0': {
			getContext: function() {
				return {
					clearRect: function() { return 0 },
					measureText: function() { return 0 },
					strokeText: function() { return 0 },
					fillText: function() { return 0 },
				}
			}
		}
	}}

	E2.dom = {
		breadcrumb: {
			children: function() { return $() },
			prepend: function() {}
		},
		canvas: [{ getContext: function(){} }],
		canvas_parent: $(),
		canvases: $()
	}

	E2.dom.webgl_canvas = {
		on:function(){},
		bind:function(){},
		'0': {
			clientWidth:1,
			clientHeight:1,
			addEventListener: function() {},
			getContext: function() {
				return {
					createShader: function() {},
					deleteShader: function() {},
					compileShader: function() {},
					shaderSource: function() {},
					attachShader: function() {},
					bindAttribLocation: function() {},
					bindBuffer: function() {},
					bufferData: function() {},
					getProgramParameter: function() {},
					createBuffer: function() {},
					linkProgram: function() {},
					createProgram: function() {}
				}
			}
		}
	}

	global.make = function() {
		return $()
	}

	E2.dom.canvas_parent.scrollTop = E2.dom.canvas_parent.scrollLeft = 
		function() { return 0; }

	global.E2.app = new Application()
	global.E2.app.updateCanvas = function() {}
	global.E2.app.getSlotPosition = function() {}
	global.E2.app.channel = {
		broadcast: function(){}
	}

	global.E2.app.worldEditor = {
		clearSelection: function() {},
		isActive: function() {
			return false
		}
	}

	global.E2.app.player = {
		core: E2.core,
		state: {}
	}

	E2.core.active_graph = new Graph(E2.core, null, {})
	E2.core.root_graph = E2.core.active_graph
	E2.core.graphs = [ E2.core.active_graph ]
	
	E2.core.renderer = {
		render: function() {},
		clear: function() {},
		setPixelRatio: function() {},
		domElement: {parentElement:{style:{}}},
		setSize: function(){},
		setSizeNoResize: function(){},
		setClearColor: function() {},
		shadowMap: {},
		getSize: function() {return {width: 1, height: 1}}
	}

	// don't try to load a graph
	global.boot = {hasEdits: true}
	//E2.app.onCoreReady()
	E2.app.setupStoreListeners()

	setupWebVRAdapter()

	return E2.core;
}

exports.runScript = function(path) {
	var js = fs.readFileSync(path)
	vm.runInThisContext(js, path)
}

exports.loadPlugin = function(name) {
	var js = fs.readFileSync(browserPath+'plugins/'+name+'.plugin.js');
	vm.runInThisContext(js, name);
}

exports.setupGlobals = function() {
	global._ = require('lodash')
	global.EditorChannel = function(){}

	// global.Graph = require(requireRoot+'/scripts/graph')
	global.Flux = require(requireRoot+'/vendor/flux')
	global.Store = require(requireRoot+'/scripts/stores/store');
	global.GraphStore = require(requireRoot+'/scripts/stores/graphStore');

	global.PeopleManager = function() {}

	global.PeopleStore = function(){}
	global.PeopleStore.prototype = {
		list: function () {
			return []
		},
		on: function() {}
	}

	global.NodeUI = function() {
		this.dom = [$()]
		this.dom.position = this.dom[0].position
		this.dom.width = this.dom[0].width
		this.dom.height = this.dom[0].height
		this.dom[0].style = {}
		this.setSelected = function(){}
		this.redrawSlots = function(){}
	}

	global.TextureCache = function() {}
	global.PatchManager = function() {}
	
	require(requireRoot+'/scripts/commands/graphEditCommands')
	exports.runScript(requireRoot+'scripts/commands/graphEditCommands.js')
	
	global.UndoManager = require(requireRoot+'/scripts/commands/undoManager.js')
	global.GraphApi = require(requireRoot+'/scripts/graphApi.js')

	global.ConnectionUI = require(requireRoot+'/scripts/connection.js').ConnectionUI
	global.ConnectionUI.prototype.resolve_slot_divs = function() {
		this.src_slot_div = $()
		this.dst_slot_div = $()
	}

	E2.ui = {
		isInProgramMode: function() {
			return false
		},
		buildBreadcrumb: function() {},
		state: {},
		showStartDialog: function() {return when.resolve()}
	}
}

exports.connect = function connect(graph, a, aidx, b, bidx, dyn) {
	var ss = a.plugin.output_slots[aidx]
	var ds = dyn ? b.getDynamicInputSlots()[bidx] : b.plugin.input_slots[bidx]

	assert.ok(ss)
	assert.ok(ds)

	var conn = new Connection(a, b, ss, ds)
	conn.uid = E2.uid()

	conn.patch_up()
	E2.app.graphApi.connect(graph, conn)
	E2.app.onLocalConnectionChanged(conn)
	conn.signal_change(true)

	return conn
}

exports.disconnect = function disconnect(graph, conn) {
	E2.app.graphApi.disconnect(graph, conn)
	E2.app.onLocalConnectionChanged(conn)
	conn.signal_change(false)
}
