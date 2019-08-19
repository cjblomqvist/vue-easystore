import Vue from 'vue'
import isFunction from 'lodash/isFunction';

// Turn into reactive store
// ------------------------
// Advantages by turning the store into Vue instances:
// 1. A _lot_ less boilerplate needed - everything is already reactive
// 2. Getters turned into computed props, which means proper SRP of computed props
// The downsides are that everything is initiated (made reactive) once on every full
// page refresh. This is as before, with less clutter in the components (where we in
// certain places added the store to props in data - which also broke SRP of store
// logic). Only "pure" objects are traverserd and made reactive (+ special handling of
// getters as computed) - so no need for special handling of methods.
// TODO:
//   1. Review if there are advantages of putting methods in the methods property on
// each Vue instance.
//   2. Do we need setters? So far no.
class StoreFactory {
  constructor(base = {}, state = {}) {
    const storeFactory = this;

    this.state = state;
    this.modules = {};

    const { computed, data, watch } = this.separate(base, state);

    return new Vue({
      data() {
        return data;
      },
      watch,
      computed: Object.assign(computed, {
        state() {
          // Helper functions
          // The same as _.fromPairs, i.e. converting [[key, value], [key2, value2], ...] => { key: value, key2: value2, ... }
          const fromPairs = (arr) => arr.reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
          // Filter out functions from object
          const filterFunctions = (obj) => fromPairs(Object.entries(obj).filter(([key, value]) => !isFunction(value)));

          // Extract all root data, but only data (filter out functions)
          let state = filterFunctions(this.$data);
          
          // Extract each modules data
          Object.assign(state, fromPairs(Object.entries(storeFactory.modules).map(([name, module]) => {
            // Use $data if Vue sub module, otherwise if observable use as is, and filter out functions
            return [name, filterFunctions(module.$data || module)]
          })));

          return state;
        }
      }),
      methods: {
        add(name, module) {
          // Convenience syntax for adding multiple modules
          if (typeof name === 'object') {
            const modules = name;

            Object.entries(modules).forEach(([name, module]) => {
              this.add(name, module);
            });

            return;
          }

          if (this[name]) {
            console.warn(`Module with name ${name} already added!`);
            return;
          }

          // Do the actual adding
          const { computed, data, watch } = storeFactory.separate(module(this), state[name]);

          if (Object.keys(computed).length) {
            this[name] = new Vue({
              data() {
                return data;
              },
              computed,
              watch
            });
          } else {
            this[name] = Vue.observable(data);
          }

          storeFactory.modules[name] = this[name];

        }
      }
    });
  }
  // Separate object into computed properties and data
  // (which includes regular functions, which gets added
  // as data but will be treated as methods, more or less).
  separate(obj, state = {}) {
    const data = {};
    const computed = {};
    const watch = obj.watch;

    // Loop through all properties and sort out all computed properties and merge in eventual external state
    Object.entries(obj).forEach(([key, value]) => {
      // Skip watched properties
      if (key === 'watch') return;

      const descriptor = Object.getOwnPropertyDescriptor(obj, key);

      if (typeof descriptor.get === 'function') {
        computed[key] = descriptor.get;
      } else {
        if (state[key]) {
          data[key] = state[key];
        } else {
          data[key] = value;
        }
      }
    });

    return { computed, data, watch };
  }
}

let installed = false;

const Plugin = {
  install(Vue, options = {}) {
    // Never install twice
    if (installed) return;

    installed = true;

    // Mixin adding this.$store to all components
    // Based upon how Vuex do it: https://github.com/vuejs/vuex/blob/dev/dist/vuex.common.js
    Vue.mixin({
      beforeCreate: function () {
        var options = this.$options;
        // store injection
        if (options.store) {
          this.$store = typeof options.store === 'function'
            ? options.store()
            : options.store;
        } else if (options.parent && options.parent.$store) {
          this.$store = options.parent.$store;
        }
      }
    });
  },
  Store: StoreFactory
};

export default Plugin
