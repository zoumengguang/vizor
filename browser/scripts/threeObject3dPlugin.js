function ThreeObject3DPlugin(core) {
	Plugin.apply(this, arguments)

	this.desc = 'THREE.js Object3D'

	this.input_slots = [
		{ name: 'position', dt: core.datatypes.VECTOR },
		{ name: 'rotation', dt: core.datatypes.VECTOR },
		{ name: 'scale', dt: core.datatypes.VECTOR, def: new THREE.Vector3(1, 1, 1) },

		{ name: 'visible', dt: core.datatypes.BOOL, def: true },
		{ name: 'castShadow', dt: core.datatypes.BOOL, def: true, label: "Cast shadow" },
		{ name: 'receiveShadow', dt: core.datatypes.BOOL, def: true, label: "Receive shadows" },

		{ name: 'name', dt: core.datatypes.TEXT, def: ''},

		{
			name:   'stereo view',
			dt:     core.datatypes.FLOAT,
			def:    0,
			desc:   'Affects how this object is rendered in stereo<br/>Stereo View - 0: both eyes, 1: left eye only, 2: right eye only, 3: mono view only'
		},
		{
			name:   'lock transform',
			dt:     core.datatypes.BOOL,
			def:    false,
			label:  "Lock transform controls",
			desc:   'if enabled, this object\'s transform is locked and can\'t be adjusted in the 3d editor.',
			patchable: false
		}
	]

	this.output_slots = [{
		name: 'object3d',
		dt: core.datatypes.OBJECT3D
	}]

	this.state = {
		position: {x: 0, y: 0, z:0},
		scale: {x: 1, y: 1, z:1},

		// names with underscores have to match with THREE.Quaternion
		// member variable names because of to/from json serialisation
		quaternion: {_x: 0, _y: 0, _z:0, _w:1}
	}

	this.pivot = {x: 0, y: 0, z: 0}

	this.lockTransformControls = false

	this.graphInputs = {
		position: new THREE.Vector3(0, 0, 0),
		scale: new THREE.Vector3(1, 1, 1),
		quaternion: new THREE.Quaternion(0, 0, 0, 1)
	}
}

ThreeObject3DPlugin.prototype = Object.create(Plugin.prototype)

ThreeObject3DPlugin.prototype.reset = function() {
	Plugin.prototype.reset.apply(this, arguments)

	if (!this.object3d)
		this.setObject3D(new THREE.Object3D())

	this.updateTransforms()
}

ThreeObject3DPlugin.prototype.getObject3D = function() {
	return this.object3d
}

ThreeObject3DPlugin.prototype.setObject3D = function(newObject3d) {
	this.object3d = newObject3d

	var that = this
	this.object3d.traverse(function(n) {
		n.castShadow = that.inputValues.castShadow
		n.receiveShadow = that.inputValues.receiveShadow
	})

	function hierarchyChanged(event) {
		var obj = event.target
		var castShadow = obj.castShadow
		var receiveShadow = obj.receiveShadow

		obj.traverse(function (n) {
			n.castShadow = castShadow
			n.receiveShadow = receiveShadow
		})
	}

	this.object3d.addEventListener('added', hierarchyChanged)

	// back reference for object picking
	this.object3d.backReference = this
}

ThreeObject3DPlugin.prototype.update_input = function(slot, data) {
	if (!this.object3d)
		return;

	this.inputValues[slot.name] = data

	var that = this

	var handlers = {
		"position": function() {
			that.graphInputs.position.x = data.x
			that.graphInputs.position.y = data.y
			that.graphInputs.position.z = data.z
		},
		"rotation": function() {
			that.graphInputs.quaternion.setFromEuler(new THREE.Euler(data.x, data.y, data.z, "YZX"))
		},
		"scale": function() {
			that.graphInputs.scale.x = data.x
			that.graphInputs.scale.y = data.y
			that.graphInputs.scale.z = data.z
		},
		"visible": function() {
			that.object3d.visible = data
		},
		"castShadow": function() {
			that.object3d.traverse(function (n) {
				n.castShadow = data
			})
		},
		"receiveShadow": function() {
			that.object3d.traverse(function (n) {
				n.receiveShadow = data
			})
		},
		"name": function() {
			that.object3d.name = data
		},
		"stereo view": function() {
			that.object3d.traverse(function (n) {
				n.layers.set(data)
			})
		},
		"lock transform": function() {
			that.lockTransformControls = data
		}
	}

	if (handlers[slot.name]) {
		if (data !== undefined) {
			handlers[slot.name]()
		}
	}
	else {
		if (this.object3d[slot.name] instanceof THREE.Color) {
			this.object3d[slot.name].copy(data)
		}
		else {
			this.object3d[slot.name] = data
		}
	}
}

ThreeObject3DPlugin.prototype.update_output = function() {
	return this.object3d
}

ThreeObject3DPlugin.prototype.state_changed = function(ui) {
	if (ui) {
		return
	}
}

ThreeObject3DPlugin.prototype.updateTransforms = function() {
	this.object3d.scale.set(
		this.graphInputs.scale.x * this.state.scale.x,
		this.graphInputs.scale.y * this.state.scale.y,
		this.graphInputs.scale.z * this.state.scale.z)

	this.object3d.position.set(
		this.graphInputs.position.x + this.state.position.x + this.pivot.x,
		this.graphInputs.position.y + this.state.position.y + this.pivot.y,
		this.graphInputs.position.z + this.state.position.z + this.pivot.z)

	this.object3d.quaternion.set(
		this.state.quaternion._x,
		this.state.quaternion._y,
		this.state.quaternion._z,
		this.state.quaternion._w)

	this.object3d.quaternion.multiply(this.graphInputs.quaternion)
}

ThreeObject3DPlugin.prototype.update_state = function() {
	if (this.object3d.layers !== this.inputValues['stereo view']) {
		var that = this
		this.object3d.traverse(function(n) {
			n.layers.set(that.inputValues['stereo view'])
		})
	}

	this.updateTransforms()
}

ThreeObject3DPlugin.prototype.canEditPosition = function() {
	return !this.lockTransformControls
}

ThreeObject3DPlugin.prototype.canEditQuaternion = function() {
	return !this.lockTransformControls
}

ThreeObject3DPlugin.prototype.canEditScale = function() {
	return !this.lockTransformControls
}

if (typeof(module) !== 'undefined')
	module.exports = ThreeObject3DPlugin
