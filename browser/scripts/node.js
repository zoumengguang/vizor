/**
 * a Node in a patching graph
 * @emits openStateChanged, pluginStateChanged, slotAdded, slotRemoved, uiSlotValueChanged
 * @constructor
 */
function Node(parent_graph, plugin_id, x, y) {
	EventEmitter.call(this)

	this.x = 0;
	this.y = 0;
	this.inputs = []
	this.outputs = []
	this.queued_update = -1
	this.dyn_inputs = []
	this.dyn_outputs = []

	this.uiSlotValues = {}

	this.uid = E2.uid()

	if (plugin_id) { // Don't initialise if we're loading.
		this.parent_graph = parent_graph;
		this.x = x;
		this.y = y;
		this.ui = null;
		this.id = E2.core.pluginManager.keybyid[plugin_id];
		this.update_count = 0;
		this.title = null;
		this.inputs_changed = false;
		this.open = true;

		this.set_plugin(E2.core.pluginManager.create(plugin_id, this))
	}
}

Node.prototype = Object.create(EventEmitter.prototype)

Node.prototype.isEntityPatch = function() {
	return !!this.plugin.isEntityPatch && this.plugin.isEntityPatch()
}

Node.prototype.getConnections = function() {
	return this.inputs.concat(this.outputs)
}

Node.prototype.getDynamicInputSlots = function() {
	return this.dyn_inputs;
}

Node.prototype.getDynamicOutputSlots = function() {
	return this.dyn_outputs;
}

Node.prototype.set_plugin = function(plugin) {
	this.plugin = plugin;
	this.plugin.updated = true;

	this.plugin.inputValues = {}

	var usedSlotNames = []
	
	function init_slot(slot, index, type) {
		slot.type = type;
		slot.index = index;

		if (usedSlotNames.indexOf(''+type+slot.name) > -1)
			throw new Error('Double slot name '+slot.name+' in '+plugin.id)

		usedSlotNames.push(''+type+slot.name)

		if (!slot.dt)
			msg('ERROR: The slot \'' + slot.name + '\' does not declare a datatype.');
	}
	
	// Decorate the slots with their index to make this immediately resolvable
	// from a slot reference, allowing for faster code elsewhere.
	// Additionally tagged with the type (0 = input, 1 = output) for similar reasons.
	for(var i = 0, len = plugin.input_slots.length; i < len; i++)
		init_slot(plugin.input_slots[i], i, E2.slot_type.input);
	
	for(var i = 0, len = plugin.output_slots.length; i < len; i++)
		init_slot(plugin.output_slots[i], i, E2.slot_type.output);

	// back reference for object picking
	this.plugin.parentNode = this
}

Node.prototype.setOpenState = function(isOpen) {
	this.open = isOpen
	this.emit('openStateChanged', isOpen)
}
	
Node.prototype.create_ui = function() {
	this.ui = new NodeUI(this, this.x, this.y)
	this.emit('uiCreated', this.ui.content, this)
}

Node.prototype.destroy_ui = function() {
	if (!this.ui)
		return;

	if (this.ui.destroy)
		this.ui.destroy()

	this.ui = null

	if (this.plugin.destroy_ui)
		this.plugin.destroy_ui()
}

Node.prototype.getFullUid = function() {
	return this.parent_graph.uid + '.' + this.uid
}

Node.prototype.destroy = function()
{
	var graph = this.parent_graph;
	var index = graph.nodes.indexOf(this);
	var pending = [];
	
	if (this.plugin.destroy)
		this.plugin.destroy();
	
	if (index !== -1)
		graph.nodes.splice(index, 1);
	
	pending.push.apply(pending, this.inputs);
	pending.push.apply(pending, this.outputs);
	
	for(var i = 0, len = pending.length; i < len; i++)
		graph.disconnect(pending[i]);
	
	this.destroy_ui();
};

Node.prototype.get_disp_name = function() {
	return !this.title ? this.id : this.title;
}

Node.prototype.reset = function() {
	var p = this.plugin

	p.inputValues = {}

	if (p.input_slots) {
		p.input_slots.map(function(slot) {
			var def = slot.def !== undefined ? slot.def : E2.core.get_default_value(slot.dt)
			p.inputValues[slot.name] = def
		})
	}

	if (p.reset)
		p.reset()

	for(var slotName in this.uiSlotValues) {
		if (!this.uiSlotValues.hasOwnProperty(slotName))
			continue

		this.setInputSlotValue(slotName, this.uiSlotValues[slotName])
	}

	p.updated = true
}

Node.prototype.geometry_updated = function() {
	if (this.outputs.length < 1)
		return
	
	for(var i = 0, len = this.outputs.length; i < len; i++) {
		var c = this.outputs[i]
		
		E2.app.getSlotPosition(c.src_node, c.ui.src_slot_div,
			E2.slot_type.output, c.ui.src_pos)
	}
	
	E2.app.updateCanvas(true)
}

Node.prototype.add_slot = function(slot_type, def) {
	var is_inp = slot_type === E2.slot_type.input;
	var slots = is_inp ? this.dyn_inputs : this.dyn_outputs;

	if (def.uid === undefined || def.uid === null)
		def.uid = E2.uid()

	if (!def.dt) {
		msg('ERROR: No datatype given for slot')
		console.trace('No datatype given for slot')
		return false
	}

	if (!def.name) {
		msg('ERROR: No name given for slot')
		console.trace('No name given for slot')
		return false
	}

	def.dynamic = true
	def.type = slot_type

	if (def.index === undefined)
		def.index = slots.length

	slots.splice(def.index, 0, def);

	for(var i = 0, len = slots.length; i < len; i++) {
		slots[i].index = i
	}

	this.emit('slotAdded', def)
	
	return def.uid;
};

Node.prototype.remove_slot = function(slot_type, suid) {
	var is_inp = slot_type === E2.slot_type.input;
	var slots = is_inp ? this.dyn_inputs : this.dyn_outputs;
	var s, i, len;

	if (!slots.length)
		return;
	
	var slot = null;
	var idx = -1;

	for(i = 0, len = slots.length; i < len; i++) {
		s = slots[i];

		if (s.uid === suid) {
			slot = s;
			idx = i;

			slots.splice(i, 1)
			break;
		}
	} 

	if (!slot)
		return;
	
	if (slots.length) {
		// Patch up cached slot indices.
		for(i = 0, len = slots.length; i < len; i++) {
			slots[i].index = i
		}
	}
	
	if (this.ui) {
		this.ui.redrawSlots();
	}
	
	var att = is_inp ? this.inputs : this.outputs;
	var pending = [];
	
	for(i = 0, len = att.length; i < len; i++) {
		var c = att[i];
		s = is_inp ? c.dst_slot : c.src_slot;
	
		if (s === slot) {
			pending.push(c);
		}
	}
	
	for(i = 0, len = pending.length; i < len; i++) {
		this.parent_graph.disconnect(pending[i]);
	}
		
	this.emit('slotRemoved', slot)
}

Node.prototype.getSlotConnections = function(slot) {
	var that = this
	var isInput = slot.type === E2.slot_type.input
	var arr = isInput ? this.inputs : this.outputs
	
	return arr.filter(function(c) {
		var s = isInput ? c.dst_slot : c.src_slot
		return s === slot
	})
}

Node.prototype.slotHasConnections = function(slot) {
	var isInput = slot.type === E2.slot_type.input
	var arr = isInput ? this.inputs : this.outputs
	return arr.some(function(c) {
		var s = isInput ? c.dst_slot : c.src_slot
		return s === slot
	})
}

Node.prototype.setInputSlotValue = function(name, value) {
	var slot = this.findInputSlotByName(name)

	if (value === slot.def) {
		delete this.uiSlotValues[name]
	} else {
		this.uiSlotValues[name] = value
	}

	this.plugin.updated = true
	this.plugin.inputValues[name] = value

	this.plugin.update_input(slot, value)
	this.emit('uiSlotValueChanged', slot, value)
}

Node.prototype.getDefaultSlotValue = function(slot) {
	// get it by the slot
	if (slot.def !== undefined)
		return slot.def

	// ask the core
	return E2.app.player.core.get_default_value(slot.dt)
}

// if the user has defined a value for an input slot when disconnected returns this value
// otherwise it returns the default slot value.
Node.prototype.getUiSlotValue = function(slot) {
	var name = slot.name
	// try by editlog
	if (this.uiSlotValues &&  this.uiSlotValues[name] !== undefined)
		return this.uiSlotValues[name]

	// else use the slot default
	return this.getDefaultSlotValue(slot)
}

Node.prototype.getInputSlotValue = function(name) {
	if (this.plugin.inputValues &&  this.plugin.inputValues[name] !== undefined)
		return this.plugin.inputValues[name]
	// else
	var slot = this.findInputSlotByName(name)
	return this.getUiSlotValue(slot)
}

Node.prototype.findInputSlotByName = function(name) {
	var slot

	this.plugin.input_slots.some(function(s) {
		if (s.name === name) {
			slot = s
			return true
		}
	})

	if (!slot) {
		this.plugin.dyn_inputs.some(function(s) {
			if (s.name === name) {
				slot = s
				return true
			}
		})
	}

	if (!slot)
		console.error('findInputSlotByName not found', name)

	return slot
}

Node.prototype.findOutputSlotByName = function(name) {
	var slot

	this.plugin.output_slots.some(function(s) {
		if (s.name === name) {
			slot = s
			return true
		}
	})

	if (!slot)
		console.error('findOutputSlotByName not found', name)

	return slot
}

Node.prototype.findSlotByUid = function(suid) {
	var slot

	this.dyn_inputs.concat(this.dyn_outputs)
	.some(function(s) {
		if (s.uid === suid) {
			slot = s
			return true
		}
	})

	if (!slot)
		console.error('Slot not found', suid)

	return slot
}

Node.prototype.find_dynamic_slot = function(slot_type, suid) {
	var slots = (slot_type === E2.slot_type.input) ? this.dyn_inputs : this.dyn_outputs;

	for(var i = 0, len = slots.length; i < len; i++) {
		if (slots[i].uid === suid)
			return slots[i];
	}

	console.error('Slot not found', slot_type, suid)
}

Node.prototype.rename_slot = function(slot_type, suid, name) {
	var slot = this.find_dynamic_slot(slot_type, suid);
	var renamed = false;
	if (slot) {
		slot.name = name;
		if (this.ui) {
			renamed = this.ui.renameSlot(slot, name, suid, slot_type);
		}
	}
	return renamed;
}
	
Node.prototype.change_slot_datatype = function(slot_type, suid, dt, arrayness) {
	var slot = this.find_dynamic_slot(slot_type, suid);

	slot.array = arrayness
	
	if (slot.dt.id === dt.id) // Anything to do?
		return false;
	
	if (slot.dt.id !== E2.dt.ANY.id) {
		// Destroy all attached connections.
		this.disconnectSlotConnections(slot)
	}
		
	slot.dt = dt;
	return true;
};

Node.prototype.disconnectSlotConnections = function(slot) {
	var pg = this.parent_graph;
	var conns = slot.type === E2.slot_type.input ? this.inputs : this.outputs
	var pending = []
	var c = null

	for(var i = 0, len = conns.length; i < len; i++) {
		c = conns[i]
	
		if (c.src_slot === slot || c.dst_slot === slot)
			pending.push(c)
	}

	for(var i = 0, len = pending.length; i < len; i++) {
		pg.disconnect(pending[i])
	}
}

Node.prototype.addInput = function(newConn) {
	// enforce only one connection per input slot
	if (this.inputs.indexOf(newConn) > -1)
		console.trace('ALREADY EXISTS')
	
	this.disconnectSlotConnections(newConn.dst_slot)

	// Ensure that the order of inbound connections are stored ordered by the indices
	// of the slots they're connected to, so that we process them in this order also.
	var inserted = this.inputs.some(function(ec, i) {
		if (ec.dst_slot.index > newConn.dst_slot.index) {
			this.inputs.splice(i, 0, newConn)
			return true;
		}
	}.bind(this))
	
	if (!inserted) {
		this.inputs.push(newConn)
	}
}

Node.prototype.addOutput = function(conn) {
	this.outputs.push(conn)
}

Node.prototype.removeOutput = function(conn) {
	conn.dst_slot.is_connected = false
	this.outputs.splice(this.outputs.indexOf(conn), 1)
	
	if (!this.slotHasConnections(conn.src_slot)) {
		conn.src_slot.is_connected = false

		if (this.ui)
			this.ui.redrawSlots()
	}
}

Node.prototype.removeInput = function(conn) {
	conn.dst_slot.is_connected = false
	this.inputs.splice(this.inputs.indexOf(conn), 1)
}

Node.prototype.update_connections = function() {
	this.outputs.forEach(function(c) {
		E2.app.getSlotPosition(c.src_node, c.ui.src_slot_div, E2.slot_type.output, c.ui.src_pos)
	})
	
	this.inputs.forEach(function(c) {
		E2.app.getSlotPosition(c.dst_node, c.ui.dst_slot_div, E2.slot_type.input, c.ui.dst_pos)
	})
	
	return this.inputs.length + this.outputs.length
}

/**
 * set connection UI flow state to off recursively
 */
Node.prototype._cascadeFlowOff = function(conn) {
	conn.ui.flow = false

	if (conn.src_node.inputs.length) {
		for (var i=0; i < conn.src_node.inputs.length; i++) {
			if (conn.src_node.inputs[i].ui.flow)
				this._cascadeFlowOff(conn.src_node.inputs[i])
		}
	}
}

Node.prototype._cascadeForceUpdate = function(conn) {
	conn.src_node.plugin.updated = true

	if (conn.src_node.inputs.length) {
		for (var i = 0, len = conn.src_node.inputs.length; i < len; i++) {
			this._cascadeForceUpdate(conn.src_node.inputs[i])
		}
	}
}

Node.prototype._update_input = function(updateContext, inp, pl, conns, needs_update) {
	var result = { dirty: false, needs_update: needs_update }
	var sn = inp.src_node

	result.dirty = sn.update_recursive(updateContext, conns)

	// TODO: Sampling the output value out here might seem spurious, but isn't:
	// Some plugin require the ability to set their updated flag in update_output().
	// Ideally, these should be rewritten to not do so, and this state should
	// be moved into the clause below to save on function calls.
	var value = sn.plugin.update_output(inp.src_slot)

	if (value === null) {
		result.dirty = false
	} else if (sn.plugin.updated &&
		(!sn.plugin.query_output || sn.plugin.query_output(inp.src_slot))
	) {
		if (inp.dst_slot.array && !inp.src_slot.array) {
			value = [value]
		} else if (!inp.dst_slot.array && inp.src_slot.array) {
			value = value[0]
		}

		var validValue = inp.dst_slot.validate ? inp.dst_slot.validate(value) : value

		// cache the input value for lookups elsewhere
		pl.inputValues[inp.dst_slot.name] = validValue

		// tell the plugin the input has changed
		pl.update_input(inp.dst_slot, validValue)

		pl.updated = true
		result.needs_update = true

		if (inp.ui && !inp.ui.flow) {
			result.dirty = true
			inp.ui.flow = true
		}
	} else if(inp.ui && inp.ui.flow) {
		inp.ui.flow = false
		result.dirty = true
	}

	return result
}

Node.prototype.update_recursive = function(updateContext, conns) {
	var dirty = false;

	if (this.update_count > 0)
		return dirty;

	this.update_count++;

	var inputs = this.inputs;
	var pl = this.plugin;
	var needs_update = this.inputs_changed || pl.updated;

	var secondPassUpdateInputs = []

	// input update step 1: collect inactive inputs before any inputs have been updated
	// (which could change the state of activeness on other inputs)
	for (var i = 0, len = inputs.length; i < len; ++i) {
		var inp = inputs[i]
		if (inp.dst_slot.inactive) {
			if (inp.ui && inp.ui.flow) {
				this._cascadeFlowOff(inp)
				dirty = true
			}
			secondPassUpdateInputs.push(inp)
		}
	}

	var anyInactive = secondPassUpdateInputs.length > 0

	// input update step 2: first pass input update: update active inputs
	for (var i = 0, len = inputs.length; i < len; ++i) {
		var inp = inputs[i]

		if (anyInactive) {
			if (inp.dst_slot.inactive) {
				// skip inactive input
				continue
			}

			// skip inputs which were previously inactive
			// these need their updated flags set on and
			// will be updated in step 3 below
			if (secondPassUpdateInputs.indexOf(inp) !== -1) {
				continue
			}
		}

		var result = this._update_input(updateContext, inp, pl, conns, needs_update)

		dirty = dirty || result.dirty
		needs_update = needs_update || result.needs_update
	}

	// input update step 3: second pass input update: recheck and update any inputs that were deactivated
	// before the first update
	for (var i = 0, len = secondPassUpdateInputs.length; i < len; ++i) {
		var inp = secondPassUpdateInputs[i]
		if (!inp.dst_slot.inactive) {
			// set reactivated inputs as updated so that their values are fetched
			this._cascadeForceUpdate(inp)
			
			var result = this._update_input(updateContext, inp, pl, conns, needs_update)

			dirty = dirty || result.dirty
			needs_update = needs_update || result.needs_update
		}
	}

	if (pl.always_update || (pl.isGraph && pl.state.always_update)) {
		pl.update_state(updateContext);
	} else if(this.queued_update > -1) {
		if(pl.update_state)
			pl.update_state(updateContext);

		pl.updated = true;
		this.queued_update--;
	} else if(needs_update || (pl.output_slots.length === 0 && (!this.outputs || this.outputs.length === 0))) {
		if(pl.update_state)
			pl.update_state(updateContext);
	
		this.inputs_changed = false;
	} else if(pl.input_slots.length === 0 && (!this.inputs || this.inputs.length === 0)) {
		if(pl.update_state)
			pl.update_state(updateContext);
	}
	
	return dirty;
}

Node.prototype.setPluginState = function(key, value) {
	this.plugin.state[key] = value

	this.plugin.updated = true
	this.plugin.dirty = true

	this.emit('pluginStateChanged', key, value)
}

Node.prototype.serialise = function(flat) {
	var that = this

	function pack_dt(slots) {
		for(var i = 0, len = slots.length; i < len; i++) {
			delete slots[i].desc;
			slots[i].dt = slots[i].dt.id;
		}
	}

	var d = {};
	
	d.plugin = this.plugin.id;
	d.x = Math.round(this.x);
	d.y = Math.round(this.y);
	d.uid = this.uid;
	
	if (Object.keys(this.uiSlotValues).length)
		d.uiSlotValues = this.uiSlotValues

	if (!this.open)
		d.open = this.open;
	
	if (this.plugin.state)
		d.state = this.plugin.state;

	if (this.title)
		d.title = this.title;
	
	if (!flat && this.plugin.isGraph)
		d.graph = this.plugin.graph.serialise();
	
	if (this.dyn_inputs.length || this.dyn_outputs.length) {
		if (this.dyn_inputs.length) {
			d.dyn_in = clone(this.dyn_inputs);
			pack_dt(d.dyn_in);
		}
		
		if (this.dyn_outputs.length) {
			d.dyn_out = clone(this.dyn_outputs);
			pack_dt(d.dyn_out);
		}
	}

	return d;
};

// force all uid's and sids into strings. issue #135
Node.prototype.fixStateSidsIssue135 = function(state) {
	function stringifySids(sids) {
		Object.keys(sids).map(function(uid) {
			sids[''+uid] = ''+sids[uid]
		})
	}

	if (state.input_sids)
		stringifySids(state.input_sids)

	if (state.output_sids)
		stringifySids(state.output_sids)
}

Node.prototype.deserialise = function(guid, d) {
	var idMap = {
		'register_local_read': 'variable_local_read',
		'register_local_write': 'variable_local_write',
	}

	if (idMap[d.plugin])
		d.plugin = idMap[d.plugin]

	this.parent_graph = guid;
	this.x = d.x;
	this.y = d.y;
	this.id = E2.core.pluginManager.keybyid[d.plugin];
	this.uid = '' + d.uid;
	this.open = d.open !== undefined ? d.open : true;
	
	this.title = d.title ? d.title : null;

	// make object3d patches use `entity` instead
	if (d.plugin === 'graph' && d.dyn_out &&
		d.dyn_out.length === 1 && d.dyn_out[0].dt === E2.dt.OBJECT3D.id)
	{
		d.plugin = 'entity'
	}

	var plg = E2.core.pluginManager.create(d.plugin, this)
	if (!plg) {
		msg('ERROR: Failed to instantiate node of type \'' + d.plugin + '\' with title \'' + this.title + '\' and UID = ' + this.uid + '.')
		return false
	}

	this.set_plugin(plg)
	
	if (this.plugin.isGraph) {
		this.plugin.setGraph(new Graph(E2.core, null, null))
		this.plugin.graph.plugin = this.plugin;
		this.plugin.graph.deserialise(d.graph);

		if (E2.core.graphs.indexOf(this.plugin.graph) === -1)
			E2.core.graphs.push(this.plugin.graph);
	}
	
	if (d.state && this.plugin.state) {
		this.fixStateSidsIssue135(d.state)

		for(var key in d.state) {
			if (!d.state.hasOwnProperty(key))
				continue;

			if (key in this.plugin.state)
				this.plugin.state[key] = d.state[key];
		}
	}
	
	if (d.dyn_in || d.dyn_out) {
		function patch_slot(slots, type) {
			var rdt = E2.core.resolve_dt;
			
			for(var i = 0; i < slots.length; i++) {
				var s = slots[i];
				s.uid = '' + s.uid;
				s.dynamic = true;
				s.dt = rdt[s.dt];
				s.type = type;
			}
		}
		
		if (d.dyn_in) {
			this.dyn_inputs = d.dyn_in;
			patch_slot(this.dyn_inputs, E2.slot_type.input);
		}

		if (d.dyn_out) {
			this.dyn_outputs = d.dyn_out;
			patch_slot(this.dyn_outputs, E2.slot_type.output);
		}
	}

	if (d.uiSlotValues)
		this.uiSlotValues = d.uiSlotValues

	return true;
};

Node.prototype.patch_up = function(graphs) {
	if (!(this.parent_graph instanceof Graph))
		this.parent_graph = Graph.resolve_graph(graphs, this.parent_graph);

	function initStructure(pg, n) {
		n.parent_graph = pg

		if (!n.plugin.isGraph)
			return;

		if (n.plugin.graph.uid === undefined)
			n.plugin.graph.uid = E2.core.get_uid()

		n.plugin.graph.parent_graph = pg

		var nodes = n.plugin.graph.nodes
		
		for(var i = 0, len = nodes.length; i < len; i++)
			initStructure(n.plugin.graph, nodes[i])
	}

	initStructure(this.parent_graph, this)
	
	if (this.plugin.isGraph)
		this.plugin.graph.patch_up(graphs)
}

Node.prototype.initialise = function() {
	if (this.plugin.state_changed)
		this.plugin.state_changed(null)

	if (this.plugin.isGraph)
		this.plugin.graph.initialise()
}

Node.prototype.getInspectorStateProps = function() {
	// get any state properties my plugin allows ui to access and from each such prop make a proxy
	if (typeof this.plugin.getInspectorProperties === 'undefined') return {}
	var that = this, plugin = this.plugin, state = plugin.state
	var props = plugin.getInspectorProperties()
	var ret = {}
	Object.keys(props).forEach(function(name){
		var prop = props[name]
		ret[name] = {
			dt 		: prop.dt,
			label 	: prop.label,
			get canEdit() {
				return typeof plugin.undoableSetState === 'function'
			},
			get _value() {
				return state[name]
			},
			// only use this setter for debugging
			// node.plugin.undoableSetState() otherwise
			set _value(v) {
				return that.setPluginState(name, v)
			}
		}
	})
	return ret
}

/**
 * @param slotNames optional explicit list
 */
Node.prototype.getInspectorSlotProps = function(slotNames) {
	if (!(slotNames instanceof Array)) {
		// get any slots my plugin allows ui to access and for each such slot make a proxy
		if (typeof this.plugin.getInspectorSlotNames === 'undefined') return {}		// v1
		slotNames = slotNames || this.plugin.getInspectorSlotNames()
	}

	var that = this
	var ret = {}
	slotNames.forEach(function(name){	// non-dynamic, input slots only
		var slot = that.findInputSlotByName(name)
		ret[name] = {
			dt 		: slot.dt,
			label 	: slot.label || slot.name,
			get canEdit() {
				return !slot.is_connected
			},
			get default() {
				return that.getUiSlotValue(slot)
			},
			get _value() {
				return that.getInputSlotValue(name)
			},
			// only use this setter for debugging
			// E2.app.graphApi.changeInputSlotValue() otherwise
			set _value(v) {
				return that.setInputSlotValue(name, v)
			}
		}
	})
	return ret
}

Node.hydrate = function(guid, json) {
	var node = new Node()
	node.deserialise(guid, json)
	node.patch_up(E2.core.graphs)
	return node
}

Node.isGraphPlugin = function(pluginId) {
	return (E2.GRAPH_NODES.indexOf(pluginId) > -1)
}


function LinkedSlotGroup(core, parent_node, inputs, outputs) {
	this.core = core;
	this.node = parent_node;
	this.inputs = inputs;
	this.outputs = outputs;
	this.n_connected = 0;
	this.dt = core.datatypes.ANY;
}

LinkedSlotGroup.prototype.forceOutputArrayness = function(arrayness) {
	this.forcedOutputArrayness = arrayness
}

LinkedSlotGroup.prototype.setArrayness = function(arrayness) {
	for(var i = 0, len = this.inputs.length; i < len; i++) {
		this.inputs[i].array = arrayness
	}

	for(var i = 0, len = this.outputs.length; i < len; i++) {
		this.outputs[i].array = this.forcedOutputArrayness === undefined ? arrayness : this.forcedOutputArrayness
	}
}

LinkedSlotGroup.prototype.set_dt = function(dt) {
	this.dt = dt;
	
	for(var i = 0, len = this.inputs.length; i < len; i++)
		this.inputs[i].dt = dt

	for(var i = 0, len = this.outputs.length; i < len; i++)
		this.outputs[i].dt = dt
}

LinkedSlotGroup.prototype.add_dyn_slot = function(slot) {
	(slot.type === E2.slot_type.input ? this.inputs : this.outputs).push(slot);
}

LinkedSlotGroup.prototype.remove_dyn_slot = function(slot) {
	var inOrOut = (slot.type === E2.slot_type.input ? this.inputs : this.outputs)
	var slotIdx = inOrOut.indexOf(slot)
	if (slotIdx > -1)
		inOrOut.splice(slotIdx, 1);
}

LinkedSlotGroup.prototype.connection_changed = function(on, conn, slot) {
	if (this.inputs.indexOf(slot) === -1 && this.outputs.indexOf(slot) === -1)
		return;
	
	this.n_connected += on ? 1 : -1;

	if (on && this.n_connected === 1) {
		var otherSlot = (slot.type === E2.slot_type.input) ? conn.src_slot : conn.dst_slot
		this.set_dt(otherSlot.dt)

		this.setArrayness(otherSlot.array)

		return true;
	}
	
	if(!on && this.n_connected === 0) {
		this.set_dt(this.core.datatypes.ANY);

		this.setArrayness(false)

		return true;
	}
	
	return false;
}

LinkedSlotGroup.prototype.infer_dt = function() {
	var node = this.node;
	var dt = null;
	var any_dt = this.core.datatypes.ANY.id;

	var anyConnectionIsArray = false

	for(var i = 0, len = node.inputs.length; i < len; i++) {
		var c = node.inputs[i];
		
		if(this.inputs.indexOf(c.dst_slot) !== -1) {
			dt = c.src_slot.dt.id !== any_dt ? c.src_slot.dt : dt;

			if (c.src_slot.array) {
				anyConnectionIsArray = true
			}

			this.n_connected++;
		}
	}

	for(var i = 0, len = node.outputs.length; i < len; i++) {
		var c = node.outputs[i];
		
		if(this.outputs.indexOf(c.src_slot) !== -1) {
			dt = c.dst_slot.dt.id !== any_dt ? c.dst_slot.dt : dt;

			if (c.dst_slot.array) {
				anyConnectionIsArray = true
			}
			this.n_connected++;
		}
	}

	this.setArrayness(anyConnectionIsArray)
	
	if (dt) {
		this.set_dt(dt);
		return this.core.get_default_value(dt);
	}
	
	return null;
};

LinkedSlotGroup.prototype.updateFreeSlots = function() {}


if (typeof(module) !== 'undefined') {
	module.exports.Node = Node
	module.exports.LinkedSlotGroup = LinkedSlotGroup
}


