function UIpoint(x,y,z) {
	this.x = x || 0;
	this.y = y || 0;
	this.z = z || 0;
}

function NodeUI(parent_node, x, y, z) {
	EventEmitter.call(this);
	var that = this

	this.nid = 'n' + parent_node.uid;
	this._id = E2.uid();
	this._destroying = false;
	this._destroyed = false;
	this.flags = {
		_set				: false,
		has_subgraph	: false,
		has_plugin_ui 	: false,
		has_inputs 		: false,
		has_outputs 	: false,
		has_dynamic_slots : false,
		has_preferences : false,
		has_edit 		: false,
		single_in 		: false,
		single_out 		: false
	};

	this._ttdata = null;		// used for tooltip switching

	/** @var Node */
	this.parent_node = parent_node;		// the node we represent
	this.selected = false;

	/* jQueries */
	this.inputCol = null;
	this.outputCol = null;
	this.inlineIn = null;
	this.inlineOut = null;
	this.header = null;
	this.content = null;
	this.pluginContainer = null;
	this.pluginUI = null;

	// use .setPosition() to modify these
	this.x = x || 0;
	this.y = y || 0;
	this.z = z || 0;
	this.position = new UIpoint(x,y,z);

	this.sl = E2.app.scrollOffset[0];
	this.st = E2.app.scrollOffset[1];

	this.dom 		= make('div');	// plugins (e.g. subgraph) may attempt to add css classes to this. ideally they shouldn't

	// INIT TEMPLATE

	var viewdata = {
		inlineIn: 		null,
		inlineOut: 	null,
		toggle_control: null,
		edit_control: 	null,
		node_title: 	null,
		plugin_inputs: 	null,
		plugin_outputs: null,
		plugin_content : null
	};

	viewdata.node_title = make('span').text(parent_node.get_disp_name()).html();

	// RENDER THE TEMPLATE

	var $dom 	= this.dom;
	var $header, $content, $edit, $toggle;

	var handlebar = null;
	if (typeof E2.views.patch_editor !== 'undefined') {
		var template_name = 'ui_plugin_' + this.parent_node.plugin.id;
		if (typeof E2.views.patch_editor[template_name] !== 'undefined')
			handlebar = E2.views.patch_editor[template_name];
		else
			handlebar = E2.views.patch_editor['ui_plugin__default']
	}
	if (handlebar) {
		/* @var $dom jQuery */
		$dom.html(handlebar(viewdata));
		$header = this.header = $dom.children('.p_header').first();
		$content = this.content = $dom.children('.p_content').first();	// normally contains ins, outs, and the plugin ui/content
		$toggle = $header.find('button.toggle').first();
		$edit = $header.find('button.edit').first();
		this.inlineIn = $header.find('.p_ins').first();
		this.inlineOut = $header.find('.p_outs').first();
		this.inputCol = $content.find('.p_ins').first();
		this.outputCol = $content.find('.p_outs').first();
		this.pluginContainer = $dom.find('.p_plugin').first();
	} else {
		// recover
		$header = this.header 	= make('div');
		$content = this.content = make('div');
		this.inputCol 			= make('div');
		this.pluginContainer 	= make('div');
		this.outputCol 		= make('div');
		this.inlineIn 			= make('div');
		this.inlineOut 		= make('div');
		$toggle = make('button');
		$edit = make('button');
		$header.append($toggle, $edit);
		$dom.append($header.append(this.inlineIn, this.inlineOut), $content.append(this.inputCol, this.pluginContainer, this.outputCol));
	}

	// ATTACH HANDLERS ETC

	var plugin = parent_node.plugin;
	if (plugin.create_ui) {
		this.pluginUI = plugin.create_ui();
		this.pluginContainer.append(this.pluginUI);
	}
	else
		this.pluginUI = {}; // We must set a dummy object so plugins can tell why they're being called.

	if (this.hasSubgraph()) {	// create a preferences button and wire it up
		NodeUI.makeSpriteSVGButton(
			NodeUI.makeSpriteSVG('vp-edit-patch-icon', 'cmd_edit_graph'),
			'Edit nested patch',
			$edit
		);
		$edit.addClass('p_fade');
		$edit.click(this.openSubgraph.bind(this));
	} else {
		$edit.remove();
	}

	$toggle.append('<svg class="icon-arrow-vertical"><use xlink:href="#icon-arrow-vertical"/></svg>');
	$toggle.addClass('plugin-toggle');
	$toggle.click(function() {
		var isOpen = !that.parent_node.open

		E2.app.dispatcher.dispatch({
			actionType: 'uiNodeOpenStateChanged',
			graphUid: that.parent_node.parent_graph.uid,
			nodeUid: that.parent_node.uid,
			isOpen: isOpen
		})
	});

	var myCategory = this.getNodeCategory();
	$dom.addClass('vp graph-node plugin');
	$dom.addClass('p_cat_' + myCategory);
	$dom.addClass('p_id_' + this.parent_node.plugin.id);
	$dom.attr('id', this.nid);
	$dom.data('uiid', this._id).attr('data-uiid', this._id);
	$dom.data('nuid', this.parent_node.uid).attr('data-nuid', this.parent_node.uid);
	$dom.data('cat', myCategory).attr('data-cat', myCategory);
	E2.dom.canvas_parent.append($dom);


	$dom.mousemove(E2.app.onMouseMoved.bind(E2.app)); // Make sure we don't stall during slot connection, when the mouse enters a node.

	$header.mousedown(E2.app.onNodeHeaderMousedown.bind(E2.app));
	$header.click(E2.app.onNodeHeaderClicked.bind(E2.app));
	$header.dblclick(this.showRenameControl.bind(this));
	$header.mouseenter(E2.app.onNodeHeaderEntered.bind(E2.app, parent_node));
	$header.mouseleave(E2.app.onNodeHeaderExited.bind(E2.app));

	this.setupDocs();

	$header.attr('alt', '' + parent_node.uid);
	this.setupTooltips($header);

	this.setCssClass();
	this.redrawSlots();

	this.parent_node.on('openStateChanged', function(isOpen) {
		that.setCssClass();
		that.parent_node.update_connections()
		E2.app.updateCanvas(true)
	})


	make_draggable($dom,
		E2.app.onNodeDragged.bind(E2.app, parent_node),
		E2.app.onNodeDragStopped.bind(E2.app, parent_node),
		$header)

	this.update();	// place in position;
	this.parent_node.on('slotAdded', function(slot){
		this.setCssClass();	// resets this.flags
		this.redrawSlots();
	}.bind(this));
	this.parent_node.on('slotRemoved', function(slot){
		this.setCssClass();
		this.redrawSlots();
	}.bind(this));
	this.parent_node.on('renamed', this.onRenamed.bind(this));

	VizorUI.disableContextMenu($dom[0]);
}

NodeUI.prototype = Object.create(EventEmitter.prototype);

NodeUI.prototype.setupDocs = function() {
	var that = this

	E2.ui.pluginDocsCache.loadDocs(this.parent_node.plugin.id)
	.then(function(docs) {
		// docs.desc = '...'
		// docs.inputs = [{name: '...', desc: '...'}, ...]
		// docs.outputs = [{name: '...', desc: '...'}, ...]

		that.parent_node.plugin.desc = docs.desc

		function slotMatcher(docSlots) {
			return function (slot) {
				for (var i = 0, len = docSlots.length; i < len; ++i) {
					if (docSlots[i].name === slot.name) {
						slot.desc = docSlots[i].desc
						return
					}
				}

				console.error('no docs for ', that.parent_node.plugin.id, '.', slot.name)
			}
		}

		that.parent_node.plugin.input_slots.map(slotMatcher(docs.inputs))
		that.parent_node.plugin.output_slots.map(slotMatcher(docs.outputs))
	})
}

NodeUI.prototype.updateTooltipsPosition = function(data) {	// find any tooltips that have our nodeId and move them accordingly.
	var repositionMyTooltips = function(data) {
		// data has uiid, dx,dy,and dz;
		var uiid = data.uiid;
		var $tooltips = jQuery('div.popover')
							.filter(function(){
									return $(this).data('uiid') == data.uiid;
								});
		if ($tooltips.length < 1) return true;
		$tooltips.each(function(){
			var $tip = jQuery(this);
			var t_uiid = $tip.data('uiid');		// the tip contains the id of UI that "owns" it
			if (!t_uiid) return;
			if (t_uiid !== uiid) return;		// check if this is us by comparing with uuid from arguments
			var pos = $tip.position();
			$tip.css({
				top: ''+ (pos.top + data.dy) + 'px',
				left: ''+ (pos.left + data.dx) + 'px'
			});
		});
	}
	repositionMyTooltips(data);
	return true;
};

NodeUI.prototype.destroy = function() {
	this._destroying = true;
	this.removeAllListeners();

	jQuery('div.popover').remove();	// clean up any tooltips, globally
	this.onHideTooltip(null);

	// clean up our own dom and remove it
	[this.inputCol,
		this.outputCol,
		this.inlineIn,
		this.inlineOut,
		this.header,
		this.content,
		this.pluginContainer,
		this.pluginUI
	].forEach(
		function(j){
			if (typeof j === 'function') {
				j.remove();
			}
			j={};
		});
	this.dom.remove();
	this._destroyed = true;
	return this;
}

NodeUI.prototype.onRenamed = function(name) {
	$('span.p_title', this.header).text(name)
	this.setCssClass()
	NodeUI.redrawActiveGraph();
}

NodeUI.prototype.openInspector = function() {
	if (this.hasPreferences())
		this.parent_node.plugin.open_inspector(this.parent_node.plugin);
	return false;
};

NodeUI.prototype.openSubgraph = function() {
	if (this.hasSubgraph())
		NodeUI.drilldown(this.parent_node);
	else console.log('no');
	return false;
};

NodeUI.prototype.setSelected = function(is_selected) {
	this.selected = is_selected;
	this.setCssClass();
}
NodeUI.prototype.isSelected = function() { return !!this.selected; };

NodeUI.prototype.setCssClass = function() {
	var $dom = this.dom;
	var flags = this.getPluginUIFlags(true);

	if (this.canDisplayInline()) {
		$dom
			.removeClass('p_expand')
			.removeClass('p_collapse')
			.addClass('p_inline')
	} else {
		$dom
			.removeClass('p_inline')
			.toggleClass('p_expand', this.parent_node.open)
			.toggleClass('p_collapse', !this.parent_node.open)
	}

	$dom
		.toggleClass('p_has_ins', flags.has_inputs)
		.toggleClass('p_has_outs', flags.has_outputs)
		.toggleClass('p_1in', flags.single_in)
		.toggleClass('p_1out', flags.single_out)
		.toggleClass('p_header_out', this.canDisplayOutputInHeader())
		.toggleClass('p_header_in', this.canDisplayInputInHeader())
		.toggleClass('p_selected', this.isSelected())
		.toggleClass('p_renamed', this.isRenamed())

	var currentWidth = $dom[0].style.width;
	if (!currentWidth) currentWidth = 'auto';
	$dom.css('width', currentWidth);	// fix Safari width bug

	return this;
};

NodeUI.prototype.getPluginUIFlags = function(reset) {
	if (typeof reset === 'undefined') reset = false;
	if (reset) this.flags._set = false;
	if (this.flags._set) return this.flags;
	this.flags.has_subgraph 	= this.hasSubgraph();
	this.flags.has_plugin_ui 	= this.hasPluginUI();
	this.flags.has_inputs 		= this.hasInputs();
	this.flags.has_outputs 		= this.hasOutputs();
	this.flags.has_preferences 	= this.hasPreferences();
	this.flags.has_dynamic_slots = this.hasDynamicSlots();
	this.flags.has_edit 		= this.hasEditButton();
	this.flags.single_in 		= this.hasOnly1Input();
	this.flags.single_out 		= this.hasOnly1Output();
	this.flags._set = true;
	return this.flags;
};

NodeUI.prototype.canDisplayInputInHeader = function() {
	return false;
};

NodeUI.prototype.canDisplayOutputInHeader = function() {
	var myCategory = this.getNodeCategory();

	if (uiPluginsThatForceDisplayOutputInHeader.indexOf(this.parent_node.plugin.id) !== -1)
		return true;

	var p = this.getPluginUIFlags();
	var can = p.single_out && (!p.has_edit) && (!p.has_dynamic_slots);	// check !p.has_inputs if stricter
	can = can && !p.has_subgraph;

	can = can && (uiPluginCategoriesThatMustNotDisplayOutputInHeader.indexOf(myCategory) === -1);
	can = can && (uiPluginsThatMustNotDisplayOutputInHeader.indexOf(this.parent_node.plugin.id) === -1);

	return can;
};

NodeUI.prototype.canDisplayInline = function() {
	var p = this.getPluginUIFlags();	// variables used to make a decision.
	var category = this.getNodeCategory();
	if (uiPluginsThatNeverDisplayInline.indexOf(this.parent_node.plugin.id) !== -1)
		return false

	var is_io = (category === uiNodeCategory.io);
	var alwaysInline = (uiPluginsThatAlwaysDisplayInline.indexOf(this.parent_node.plugin.id) > -1)

	var can = !p.has_plugin_ui;
	can = can && !p.has_subgraph;
	can = can && (is_io || alwaysInline);
	if (is_io) {
		can = can && ((p.single_in && !p.has_outputs) ||
				(p.single_out && !p.has_inputs) ||
				((this.parent_node.dyn_inputs.length === 1) && (!p.has_outputs)) ||		// read var
				((this.parent_node.dyn_outputs.length === 1) && (!p.has_inputs)));		// write var
	} else {
		can = can && ((p.single_in && !p.has_outputs) || (p.single_out && !p.has_inputs));
	}

	return can;
};

NodeUI.prototype.getContainerForSlotsOfType = function(isInput, isDynamic) {
	var canDisplayInline = this.canDisplayInline();
	var canDisplayOutputInHeader = this.canDisplayOutputInHeader();
	var canDisplayInputInHeader = this.canDisplayInputInHeader();

	if (canDisplayInline)
		return (isInput) ? this.inlineIn : this.inlineOut;
	// else
	if (isDynamic)
		return (isInput) ? this.inputCol : this.outputCol;
	// else static
	if (canDisplayOutputInHeader && !isInput)
		return this.inlineOut;

	if (canDisplayInputInHeader && isInput)
		return this.inlineIn;

	return null;
}

NodeUI.prototype.redrawSlots = function() {
	var canDisplayInline = this.canDisplayInline();

	this.inlineIn.empty();
	this.inlineOut.empty();
	this.inputCol.empty();
	this.outputCol.empty();

	if (canDisplayInline) {
		this.renderSlots(this.inlineIn, this.parent_node.plugin.input_slots, E2.slot_type.input);
		this.renderSlots(this.inlineOut, this.parent_node.plugin.output_slots, E2.slot_type.output);
		this.renderSlots(this.inlineIn, this.parent_node.dyn_inputs, E2.slot_type.input);
		this.renderSlots(this.inlineOut, this.parent_node.dyn_outputs, E2.slot_type.output);
		return this;
	}
	// else...

	// render inputs
	this.renderSlots(this.inputCol, this.parent_node.plugin.input_slots, E2.slot_type.input);
	if(this.parent_node.dyn_inputs)
		this.renderSlots(this.inputCol, this.parent_node.dyn_inputs, E2.slot_type.input);

	// render outputs
	if (this.canDisplayOutputInHeader()) {
		this.renderSlots(this.inlineOut, this.parent_node.plugin.output_slots, E2.slot_type.output);
		// just in case
		if(this.parent_node.dyn_outputs)
			this.renderSlots(this.outputCol, this.parent_node.dyn_outputs, E2.slot_type.output);
	} else {
		this.renderSlots(this.outputCol, this.parent_node.plugin.output_slots, E2.slot_type.output);
		if(this.parent_node.dyn_outputs)
			this.renderSlots(this.outputCol, this.parent_node.dyn_outputs, E2.slot_type.output);
	}

	NodeUI.redrawActiveGraph();	// fix #584
	return this;
};

NodeUI.prototype.hasSubgraph = function() {
	return (typeof this.parent_node.plugin.drilldown === 'function');
};

NodeUI.prototype.hasDynamicSlots = function() {
	var node = this.parent_node;
	return node.dyn_inputs.length + node.dyn_outputs.length > 0;
}

NodeUI.prototype.hasInputs = function() {
	var node = this.parent_node;
	return (node.plugin.input_slots.length + node.dyn_inputs.length) > 0;
};

NodeUI.prototype.hasOutputs = function() {
	var node = this.parent_node;
	return (node.plugin.output_slots.length + node.dyn_outputs.length) > 0;
};

NodeUI.prototype.hasPluginUI = function() {
	return (typeof this.parent_node.plugin.create_ui === 'function');
};

NodeUI.prototype.hasPreferences = function() {
	return (typeof this.parent_node.plugin.open_inspector === 'function');
};

// aliases
NodeUI.prototype.hasInspector = NodeUI.prototype.hasPreferences;

NodeUI.prototype.hasOnly1Input = function() {
	var node = this.parent_node;
	return (node.plugin.input_slots.length === 1) && (node.dyn_inputs.length === 0);
};

NodeUI.prototype.hasOnly1Output = function() {
	var node = this.parent_node;
	return (node.plugin.output_slots.length === 1) && (node.dyn_outputs.length === 0);
};

NodeUI.prototype.hasEditButton = function() {
	return false;
};

NodeUI.prototype.isRenamed = function() {
	var hasTitle = (this.parent_node.title || false);
	var hasNoSubgraph = !this.hasSubgraph();
	var nodeCategory = this.getNodeCategory();
	var notExempt = uiPluginCategoriesAutoRenamed.indexOf(nodeCategory) === -1;
	return (hasTitle && notExempt && hasNoSubgraph && (this.parent_node.title !== this.parent_node.id));
};

NodeUI.prototype.hasBeenRenamed = NodeUI.prototype.isRenamed;

NodeUI.prototype.setPosition = function(x, y, z) {
	var data = {
		uiid: this._id,
		nid: this.nid,
		dx: this.position.x,
		dy: this.position.y,
		dz: this.position.z
	};
	if (typeof x !== 'undefined') this.position.x = this.x = x;
	if (typeof y !== 'undefined') this.position.y = this.y = y;
	if (typeof z !== 'undefined') this.position.z = this.z = z;

	this.update();	// this may adjust position

	data.dx = this.position.x - data.dx;
	data.dy = this.position.y - data.dy;
	data.dz = this.position.z - data.dz;
	this.updateTooltipsPosition(data);

	this.emit(uiNodeEventType.positionChanged, data);	// @todo this doesn't always emit?
};

/**
 *  Stub. For now it just places the UI in position.
 */
NodeUI.prototype.update = function() {
	if (!this.dom) return;
	var s = this.dom[0].style;

	var xx = this.position.x;
	var yy = this.position.y;

	// temporary fix for plugins appearing at -98px top, until VP allows plugins to display at negative positions.
	if (xx < 0) this.position.x = this.x = xx = 0;
	if (yy < 0) this.position.y = this.y = yy = 0;
	s.left = '' + xx + 'px';
	s.top = '' + yy + 'px';
};


NodeUI.prototype.showRenameControl = function() {
	var that = this
	var node = this.parent_node;
	var $dom = this.dom;

	if ($dom.hasClass('p_renaming')) return true;

	var input = $('<input class="node-title-input" placeholder="Type a title" />')

	var $titleSpan = $dom.find('span.p_title').first();
	var titleOffset = $titleSpan.offset();
	var domOffset = $dom.offset();

	$dom.addClass('p_renaming');
	input
		.appendTo($dom.find('.p_wrap'))
		.addClass('p_rename')
		.css({
			width:  '' + $titleSpan.innerWidth() - 10 + 'px',
			left: '' + (10 + titleOffset.left - domOffset.left) + 'px'
		})
		.val(node.get_disp_name())
		.keydown(function(e){
			var code = e.keyCode || e.which
			if(code === 13) {
				var name = $(e.target).val().replace(/^\s+|\s+$/g,'') // remove extra spaces
				jQuery(e.target).trigger('blur');

				if (!name) {
					if (E2.GRAPH_NODES.indexOf(node.plugin.id) > -1) {
						// TODO: for patches get the name of the patch.
						name = false;	// do not rename node for now
					}
					else {
						name = node.id
					}
				}

				if (name) {
					E2.app.graphApi.renameNode(E2.core.active_graph, node, name);
				}

			}
			return true;
		})
		.keyup(function(e) {

			var code = e.keyCode || e.which
			if(code === 27) {
				jQuery(e.target).trigger('blur');
			}
			return true;

		})
		.select()
		.bind('blur', function() {
			$(this).remove();	// this = input
			$dom.removeClass('p_renaming');
		})
		.focus()
};

// returns one of uiNodeCategory values for this.parent_node
NodeUI.prototype.getNodeCategory = function() {
	return uiNodeCategoryMap.getCategory(this.parent_node.plugin.id);
};

NodeUI.prototype.getDisplayName = function() {
	return this.parent_node.get_disp_name();
};


NodeUI.prototype.onShowTooltip = function(e) {
	var that = this		// NodeUI

	if(E2.app.inDrag)
		return false;

	var $elem = $(e.currentTarget);

	if (!this._ttdata) this._ttdata = {
		_tooltipElem : null,
		_tooltipTimer : null,
		_tooltipHideTimer : null
	};
	var data = this._ttdata;

	var tokens = $elem.attr('alt').split('_');

	var core = E2.core;
	var node = E2.core.active_graph.nuid_lut[tokens[0]];
	var txt = '';
	var readmore= '';

	if(tokens.length < 2) // Node?
	{
		var p_name = core.pluginManager.keybyid[node.plugin.id];

		txt += '<b>' + p_name + '</b><br/><br/>' + node.plugin.desc;
	}
	else // Slot
	{
		var plugin = node.plugin;
		var slot = null;

		var isDynamic = tokens[1][0] === 'd';
		var isInput = tokens[1][1] === 'i';
		var isOutput = !isInput;

		if(isDynamic)
			slot = node.findSlotByUid(tokens[2])
		else
			slot = (isInput ? plugin.input_slots : plugin.output_slots)[parseInt(tokens[2], 10)];

		txt = '<b>Type:</b> ' + slot.dt.name;

		if ( (isOutput && this.hasOnly1Output()) || (isInput && this.canDisplayInline()) ) {
			txt += '<br><b>Name:</b> ' + slot.name;
		}

		var currentValue = this.parent_node.getUiSlotValue(slot)
		if ((!slot.is_connected) &&
			(currentValue !== null) &&
			(typeof slot.def !== 'undefined') &&
			(currentValue !== slot.def)
			&& !(currentValue instanceof Object))  {
			txt += '<br><b>Current value:</b> ' + currentValue;
		}

		if (slot.array)
			txt += '<br><b>Array:</b> yes';

		if (slot.inactive)
			txt += '<br><b>Inactive:</b> yes';

		if(slot.lo !== undefined || slot.hi !== undefined)
			txt += '<br><b>Range:</b> ' + (slot.lo !== undefined ? 'min. ' + slot.lo : '') + (slot.hi !== undefined ? (slot.lo !== undefined ? ', ' : '') + 'max. ' + slot.hi : '')

		if (slot.def !== undefined) {
			txt += '<br><b>Default:</b> '

			if (slot.def === null)
				txt += 'Nothing'
			else
				txt += slot.def
		}

		txt += '<br /><br />';

		if (readmore) {
			readmore = '<div class="readmore">' + readmore + '</div>'
		}

		if(slot.desc)
			txt += slot.desc.replace(/\n/g, '<br/>');
	}


	var popovers = jQuery('body div.popover');
	var timeout = (popovers.length > 0) ? 350 : 2500;

	if (data._tooltipTimer) clearTimeout(data._tooltipTimer);
	if (data._tooltipElem) {
		data._tooltipElem.popover('destroy');
		data._tooltipElem = null;
		clearTimeout(data._tooltipHideTimer);
	}

	var uiid = this._id;
	data._tooltipTimer = setTimeout(function() {
		if (E2.app.inDrag)
			return;

		$elem.popover('destroy');
		popovers.remove();

		$elem.popover({
			title: txt,
			content: readmore,
			container: 'body',
			animation: false,
			trigger: 'manual',
			placement: 'top',
			html: true,
			template: '<div class="popover" role="tooltip" data-uiid="'+uiid+'"><div class="arrow"></div><div class="popover-title"></div><div class="popover-content"></div></div>'
		})
		.popover('show');

		data._tooltipElem = $elem;
		data._tooltipHideTimer = setTimeout(that.onHideTooltip.bind(that), 30000);

	}, timeout);

	return true;

};

NodeUI.prototype.onHideTooltip = function(e) {	// this = $(element that has popovers)
	var data = this._ttdata;
	if (!data) return true;

	clearTimeout(data._tooltipTimer)
	clearTimeout(data._tooltipHideTimer)
	var killTooltip = function() {
		if (data._tooltipElem) {
			data._tooltipElem.popover('destroy');
			data._tooltipElem = null;
		}
	};
	if (this._destroying)
		killTooltip()
	else
		setTimeout(killTooltip, 50);	// note this timeout must be less than the least in onShowToolTip

	return (E2.app.inDrag)
};

/**** "static" *****/

// helpers
/**
 * @returns jQuery
 */
NodeUI.makeSpriteSVG = function(xlink, className) {
	return $('<svg class="' + className + '"><use xlink:href="#'+ xlink +'"/></svg>');
};
/**
 * @returns jQuery
 */
NodeUI.makeSpriteSVGButton = function($svg, alt_text, $have_button) {
	if (typeof $have_button === 'undefined') $have_button = makeButton(null, '');
	return $have_button
		.attr('title', (alt_text || ''))
		.removeClass('btn')
		.addClass('vp svg')
		.append($svg);
};


// sets up tooltip event listeners for a dom element that represents a node or slot
NodeUI.prototype.setupTooltips = function($element) {
	var uiId = $element.data('uiid');
	if ((typeof uiId === 'undefined') || (!uiId)) {
		$element.attr('data-uiid', this._id).data('uiid', this._id);
	}
	$element.hover(this.onShowTooltip.bind(this), this.onHideTooltip.bind(this));
	return $element;
};

NodeUI.prototype.createSlot = function(container, s, type) {
	var $div = make('div');
	var isDefaultValue = this.parent_node.getUiSlotValue(s) === s.def
	var node = this.parent_node;
	var nid = this.nid;

	var isInput = (type === E2.slot_type.input);
	var isDynamic = (typeof s.uid !== 'undefined')
	var isConnected = (typeof s.is_connected !== 'undefined') && s.is_connected;

	var sid;
	if (isDynamic)
		sid = nid + (isInput ? 'di' : 'do') + s.uid;
	else
		sid = nid + (isInput ? 'si' : 'so') + s.index;
	$div.attr('id',sid);

	$div.addClass('pl_slot p_slot');
	$div.addClass( (isInput) ? 'p_in' : 'p_out' );
	if (isDynamic) $div.addClass('p_dynamic');
	if (isConnected) $div.addClass('p_connected');

	var $status = make('span');	// contains the two svg-s, on and off, loaded from sprite already in the document.
	var $label = make('label')
	if (isInput) {
		$div.append($status, $label);
	} else {
		$div.append($label, $status);
	}
	$status.addClass('status');
	$status.append(NodeUI.makeSpriteSVG('vp-port-connected', 'p_conn_status p_on'));
	$status.append(NodeUI.makeSpriteSVG('vp-port-unconnected', 'p_conn_status p_off'));

	container.append($div);
	$div.mouseenter(E2.app.onSlotEntered.bind(E2.app, node, s, $div));
	$div.mouseleave(E2.app.onSlotExited.bind(E2.app, node, s, $div));
	$div.mousedown(E2.app.onSlotClicked.bind(E2.app, node, s, $div, type));

	var altSid = '' + node.uid;

	altSid += '_' + (s.uid !== undefined ? 'd' : 's');
	altSid += type === E2.slot_type.input ? 'i' : 'o';
	altSid += '_' + (s.uid !== undefined ? s.uid : s.index);

	$div.attr('alt', altSid);

	var suid = s.uid || '';
	// some more metadata
	var is_dyn = isDynamic.toString();
	$div.data('nid', this.nid).attr('data-nid', this.nid);
	$div.data('sid', suid).attr('data-sid', suid);
	$div.data('dyn', is_dyn).attr('data-dyn', is_dyn);
	$div.data('type', type).attr('data-type', type);
	this.setupTooltips($div);

	var setSlotLabel = function(slot, value){
		if (slot !== s) return
		var isOverride   = (!slot.is_connected) && (typeof slot.def !== 'undefined') && (value !== null) && (value !== slot.def)
		if (isOverride)
			$label.html(s.name + '*')
		else
			$label.html(s.name)
	}

	this.parent_node.on('uiSlotValueChanged', setSlotLabel)
	setSlotLabel(s, this.parent_node.getUiSlotValue(s))

	return $div;
};

NodeUI.prototype.renameSlot = function(slot, name, suid, slot_type) {
	if (!slot) return false;	// don't know what we're doing

	var is_inp = slot.type === E2.slot_type.input;
	var seek = (is_inp) ? [this.inputCol, this.inlineIn] : [this.outputCol, this.inlineOut];

	var did_rename = false;
	seek.forEach(function($j){
		var slots = $j.find('div.p_slot');
		slots.filter(function(){
			return (jQuery(this).data('sid') === slot.uid);
		})
		.each(function(){
			jQuery(this).find('label').html(name);
			did_rename = true;
		});
	});

	return did_rename;
};

NodeUI.prototype.renderSlots = function(container, slots, type) {
	for(var i = 0, len = slots.length; i < len; i++) {
		if (slots[i].patchable !== false)
			this.createSlot(container, slots[i], type);
	}
};

// open nested graph for editing
NodeUI.drilldown = function(node) {	// taken from nested graph plugin
	var p = node.plugin;
	if(p.graph) {
		var ptn = p.graph.parent_graph.tree_node

		if(!ptn.open) {
			ptn.graph.open = true
			ptn.rebuild_dom()
		}

		E2.app.setActiveGraph(p.graph)
	}
	return false;
};

/**
 * forces all connections to resolve their slot divs and redraws the canvas.
 * expensive and heavy-handed. use as a last resort. (gm)
 * @return boolean if updateCanvas was called
 */
NodeUI.redrawActiveGraph = function() {
	var changed = false;
	if (!E2.core.active_graph) return false;
	E2.core.active_graph.connections.forEach(function(c){
		if (c.ui) {
			c.ui.resolve_slot_divs(false);
			E2.app.redrawConnection(c);
			changed = true;
		}
	});

	if (changed) {
		E2.app.updateCanvas(true);
	}
	E2.ui.state.selectedObjects = E2.ui.state.selectedObjects;	// force refresh
	return changed;
};

if (typeof(module) !== 'undefined')
	module.exports = NodeUI
