/**
 * Leonard Nimoy Da Voronoici
 *
 * Creates a server-client based interactive voronoi diagram
 *
 */

(function(window) {

  var Bubbles = function(domElement) {

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.needsUpdate = false;

    // init users
    this.users = {};

    // init heroku socket and callbacks
    var that = this;
    this.socket = io();

    this.socket.on('initUser', function(users, userId) {
      that.server_on_connection(users, userId);
    });

    this.socket.on('userDidInit', function(userId, user) {
      that.server_user_added(userId, user);
    });

    this.socket.on('userDidDisconnect', function(userId) {
      that.server_user_removed(userId);
    });

    this.socket.on('userDidUpdate', function(userId, user) {
      that.server_user_updated(userId, user);
    });

    this.spheres = [];

    // init scene
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 100000);
    this.camera.position.z = 2000;
    this.cameraCube = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 100000);
    this.scene = new THREE.Scene();
    this.sceneCube = new THREE.Scene();
    this.geometry = new THREE.SphereGeometry(100, 32, 16);
    var path = "img/bubbles/";
    var format = '.jpg';
    var urls = [
      path + 'posx' + format, path + 'negx' + format,
      path + 'posy' + format, path + 'negy' + format,
      path + 'posz' + format, path + 'negz' + format
    ];
    this.textureCube = THREE.ImageUtils.loadTextureCube(urls);
    this.textureCube.format = THREE.RGBFormat;
    this.shader = THREE.FresnelShader;
    this.uniforms = THREE.UniformsUtils.clone(this.shader.uniforms);
    this.uniforms["tCube"].value = this.textureCube;
    this.parameters = {
      fragmentShader: this.shader.fragmentShader,
      vertexShader: this.shader.vertexShader,
      uniforms: this.uniforms
    };
    this.material = new THREE.ShaderMaterial(this.parameters);
    this.scene.matrixAutoUpdate = false;
    // Skybox
    this.skyshader = THREE.ShaderLib["cube"];
    this.skyshader.uniforms["tCube"].value = this.textureCube;
    this.skymaterial = new THREE.ShaderMaterial({
      fragmentShader: this.skyshader.fragmentShader,
      vertexShader: this.skyshader.vertexShader,
      uniforms: this.skyshader.uniforms,
      side: THREE.BackSide
    });
    var skymesh = new THREE.Mesh(new THREE.BoxGeometry(100000, 100000, 100000), this.skymaterial);
    this.sceneCube.add(skymesh);

    // init renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: false
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x000000);
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    domElement.getElementById('container').appendChild(this.renderer.domElement);

    // mouse listeners
    domElement.body.addEventListener('mousemove',
      function(event) {
        event.preventDefault();
        that.user_position_updated(event.clientX, event.clientY);
      },
      false);

    domElement.body.addEventListener('ontouchstart',
      function(event) {
        event.preventDefault();
        that.user_position_updated(event.touches[0].pageX, event.touches[0].pageY);
      },
      false);

    domElement.body.addEventListener('touchmove',
      function(event) {
        event.preventDefault();
        that.user_position_updated(event.touches[0].pageX, event.touches[0].pageY);
      },
      false);
  };

  Bubbles.prototype.server_on_connection = function(users, userId) {
    console.log('Server: connected', users, userId);

    // add self to users object
    this.id = userId;
    this.users = users;
    this.users[this.id] = {
      x: 0,
      y: 0,
      img: false
    };

    // notify server
    this.socket.emit('userDidInit', this.id, this.users[this.id]);

    for (var u in this.users) {
      console.log(u, this.users[u]);
      this.create_sphere(u, this.users[u]);
    }
  };

  Bubbles.prototype.server_user_added = function(userId, user) {
    console.log('Server: user', userId, 'added at', user.x, user.y, this.users);
    this.users[userId] = {
      x: user.x,
      y: user.y,
      img: user.img
    };
    this.create_sphere(userId, this.users[userId]);
    this.needsUpdate = true;
  };

  Bubbles.prototype.server_user_removed = function(userId) {
    console.log('Server: user', userId, 'removed', this.users);
    delete this.users[userId];
    delete this.scene.getObjectByName(userId);
  };

  Bubbles.prototype.server_user_updated = function(userId, user) {
    // console.log('Server: user', userId, 'updated', user.x, user.y);
    this.users[userId].x = user.x;
    this.users[userId].y = user.y;
    this.users[userId].img = user.img;
    this.needsUpdate = true;
  };

  Bubbles.prototype.client_user_updated = function() {
    this.socket.emit('userDidUpdate', this.id, this.users[this.id]);
  };

  Bubbles.prototype.user_position_updated = function(canvasX, canvasY) {
    var sceneX = (canvasX/this.width)*2 - 1;
    var sceneY = 1 - 2*(canvasY/this.height);

    this.users[this.id].x = sceneX;
    this.users[this.id].y = sceneY;
    this.client_user_updated();
    this.needsUpdate = true;
  };

  Bubbles.prototype.create_sphere = function(id, user) {
    var mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.name = id;
    mesh.position.x = user.x;
    mesh.position.y = user.y;
    mesh.position.z = 0;
    mesh.scale.x = mesh.scale.y = mesh.scale.z = 3;
    this.scene.add(mesh);
    this.spheres.push(mesh);
  };

  Bubbles.prototype.update_spheres = function(id, user) {
    var mouseVec = new THREE.Vector3(user.x, user.y, 0.5);
    mouseVec.unproject(this.camera);
    mouseVec.sub(this.camera.position);
    var dir = mouseVec.normalize();
    var distance = -this.camera.position.z / dir.z;
    var pos = this.camera.position.clone().add(dir.multiplyScalar(distance));

    this.scene.getObjectByName(id).position.x = pos.x;
    this.scene.getObjectByName(id).position.y = pos.y;
  };

  Bubbles.prototype.render = function() {
    this.renderer.render(this.sceneCube, this.cameraCube);
    this.renderer.render(this.scene, this.camera);
  };

  Bubbles.prototype.update = function() {
    // how to give this momentum?
    if (this.needsUpdate) {
      for (var u in this.users) {
        this.update_spheres(u, this.users[u]);
      }
      this.needsUpdate = false;
    }
  };

  window.Bubbles = Bubbles;

})(window);