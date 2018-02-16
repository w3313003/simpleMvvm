function observer(obj) {
    if (!obj || typeof obj !== 'object') return;
    return new Observer(obj)
}

class Observer {
    constructor(data) {
        this.$data = data;
        this._init(this.$data)
    }
    _init(data) {
        Object.keys(data).forEach(key => {
            this.defineProperty(data, key, data[key])
        })
    }
    defineProperty(data, key, val) {
        let dep = new Dep,
            //  递归 劫持子属性
            child = observer(val);
        Object.defineProperty(data, key, {
            enumerable: true,
            configurable: true,
            get: () => {
                if (Dep.target) {
                    dep.depend();
                }
                return val
            },
            set: newVal => {
                if (newVal === val) return;
                val = newVal;
                child = observer(val);
                dep.notify();
            }
        })
    }
}

let uid = 0;

class Dep {
    constructor() {
        this.id = uid++;
        this.subs = [];
    }
    addSub(sub) {
        this.subs.push(sub)
    }
    depend() {
        Dep.target.addDep(this);
    }
    removeSub(sub) {
        this.subs.splice(this.subs.findIndex(v => v === sub), 1);
    }
    notify() {
        this.subs.forEach(sub => {
            sub.update();
        })
    }
}
Dep.target = null;

class Watcher {
    constructor(vm, exp, cb) {
        this.vm = vm;
        this.cb = cb;
        this.exp = exp;
        this.idMap = {};
        this.getter = this.parseGetter(exp);
        this.val = this.get();
    }
    update() {
        this.start();
    }
    start() {
        let value = this.get(),
            oldVal = this.val;
        if (value === oldVal) return;
        this.val = value;
        this.cb.call(this.vm, value, oldVal);
    }
    get() {
        Dep.target = this;
        //  取值 触发一次ob getter 之后触发一次addDep事件 把自身加入订阅者数组
        let value = this.getter.call(this.vm, this.vm);
        Dep.target = null;
        return value;
    }
    addDep(dep) {
        //  避免重复加入
        if (!this.idMap.hasOwnProperty(dep.id)) {
            dep.addSub(this);
            this.idMap[dep.id] = dep;
        }
    }
    parseGetter(exp) {
        // 取末代属性 类似compile类 command工具的getter setter
        if (/[^\w.$]/.test(exp)) return;
        let expList = exp.split('.');
        return vm => {
            let value = vm;
            expList.forEach(e => {
                value = value[e]
            });
            return value;
        }
    }
}

class Compile {
    constructor(el, vm) {
        this.$vm = vm;
        this.$el = this.isElementNode(el) ? el : document.querySelector(el);
        if (this.$el) {
            this.fragment = this.createFragment(this.$el);
            this._init();
            this.$el.appendChild(this.fragment);
        }
    }
    isElementNode(node) {
        return node.nodeType === 1
    }
    isTextNode(node) {
        return node.nodeType === 3
    }
    isDirective(attr) {
        return attr.indexOf('v-') === 0;
    }
    isEventDirective(attr) {
        return attr.indexOf('on') === 0;
    }
    createFragment(el) {
        let fragment = document.createDocumentFragment(),
            child;
        while (el.firstChild) {
            child = el.firstChild;
            fragment.appendChild(child);
        }
        return fragment
    }
    _init() {
        this.compileElement(this.fragment);
    }
    compileElement(el) {
        let childNodes = el.childNodes;
        [...childNodes].forEach(node => {
            let text = node.textContent,
                reg = /\{\{(.*)\}\}/g;
            if (this.isElementNode(node)) {
                this.compile(node)
            } else if (this.isTextNode(node) && reg.test(text)) {
                let exp = text.replace(/[\s]/g,'').replace(/[\{\}]/g, '');
                this.compileText(node, exp);
            }
            if (node.childNodes && node.childNodes.length) {
                this.compileElement(node);
            }
        })
    }
    compile(node) {
        let attrList = node.attributes;
        [...attrList].forEach(attr => {
            let attrName = attr.name;
            if (this.isDirective(attrName)) {
                let exp = attr.value,
                    //  v-on:click = model; exp -> model; dir -> on:click
                    dir = attrName.substring(2);
                if (this.isEventDirective(dir)) {
                    command.eventHandler(node, this.$vm, exp, dir)
                } else {
                    if (command[dir]) {
                        command[dir](node, this.$vm, exp);
                    }
                }
            }
        })
    }
    compileText(node, exp) {
        command.text(node, this.$vm, exp);
    }
}

let command = {
    bind(node, vm, exp, name) {
        
        let updateFn = update[`${name}Updater`];
        // console.log(node, vm, exp, name)
        if (updateFn) {
            updateFn(node, this._getVmVal(vm, exp))
        }
        new Watcher(vm, exp, (value, oldValue) => {
            if (updateFn) {
                updateFn(node, value, oldValue)
            }
        })
    },
    _getVmVal(vm, exp) {
        let value = vm,
            exps = exp.split('.');
        exps.forEach(v => {
            value = vm[v];
        });
        return value;
    },
    _setVmVal(vm, exp, newVal) {
        exp.split('.').forEach((v, i, arr) => {
            if (i < arr.length - 1) {
                vm = vm[v]
            } else {
                vm[v] = newVal;
            }
        })
    },
    text(node, vm, exp) {
        this.bind(node, vm, exp, 'text')
    },
    html(node, vm, exp) {
        this.bind(node, vm, exp, 'html')
    },
    class(node, vm, exp) {
        this.bind(node, vm, exp, 'class');
    },
    model(node, vm, exp) {
        this.bind(node, vm, exp, 'model');
        let val = this._getVmVal(vm, exp);
        node.addEventListener('input', e => {
            if (val === e.target.value) return;
            this._setVmVal(vm, exp, e.target.value);
        })
    },
    eventHandler(node, vm, exp, eventname) {
        let eventType = eventname.split(':')[1];
        if (vm.$config.methods) {
            fn = vm.$config.methods[exp]
        };
        if (eventType && fn) {
            node.addEventListener(eventType, fn.bind(vm), false)
        }
    }
};

let update = {
    textUpdater(node, val) {
        node.textContent = typeof val == 'undefined' ? '' : val;
    },
    htmlUpdater(node, val) {
        node.innerHTML = typeof val == 'undefined' ? '' : val;
    },
    modelUpdater(node, value, oldValue) {
        node.value = typeof value == 'undefined' ? '' : value;
    }
}


class Captain {
    constructor(config = {}) {
        this.$config = config;
        let data = this._data = this.$config.data
        // Object.keys(data).forEach(v => {
        //     this._proxyData(v);
        // });
        this._proxy(this._data, this);
        this._initComputed();
        observer(data);
        new Compile(this.$config.el || document.body, this);
    }

    // 数据代理 把this.data.sth 转换为this.sth
    _proxy(data) {
        Object.keys(data).forEach(key => {
            Object.defineProperty(this, key, {
                enumerable: true,
                configurable: true,
                get: () => {
                    return this._data[key]
                },
                set: newVal => {
                    this._data[key] = newVal;
                }
            })
        })

    }
    // _proxyData(key, set, get) {
    //     set = set ||
    //         Object.defineProperty(this, key, {
    //             configurable: false,
    //             enumerable: true,
    //             get: () => {
    //                 return this._data[key];
    //             },
    //             set: newVal => {
    //                 this._data[key] = newVal
    //             }
    //         })
    // }
    _initComputed() {
        let computed = this.$config.computed;
        if (typeof computed === 'object') {
            Object.keys(computed).forEach(v => {
                Object.defineProperty(this, v, {
                    get: typeof computed[v] === 'function' ?
                        computed[v] : computed[v].get,
                })
            })
        }
    }
}