var canvas;
var gl;

var cubeVerticesBuffers = [];
var cubeVerticesIndexBuffer;

var bufferCount;

var voxelMaterials = [];
var voxelMaterialIndex = 0;

var frameVerticesBuffer;
var frameIndexBuffer;

// Using multiple framebuffers since can't use multiple color attachments without extensions or webgl2
var rtVoxBuffer;
var rtCopyBuffer;
var rtScrPosBuffer;
var rtShadowBuffer;

var rtVoxTexture;
var rtCopyTexture;
var rtScrPosTexture;
var rtScrDepthTexture;
var rtShadowTexture;
var rtShadowDepthTexture;

var sculptDataProgram;
var rtCopyProgram;

var toolDataMaterial;
var copyMaterial;
var composeMaterial;

var toolShaders = [];

var lastUpdateTime = 0;

var particleCount = 1000;

var timeScale = 1.0;

var leftDown = false;
var rightDown = false;
var lastMouseX = null;
var lastMouseY = null;


var currSculpting = false;

var perspectiveMatrix = [];
var vMatrix = [];

var cameraPosition = [];
var cameraRotation = [];

var cameraForward = [];
var cameraUp = [];
var cameraRight = [];

var brushSpeed = 60.0;

var lastActionTime = 0.0;
var actionUsed = false;


// support for up to RT_TEX_SIZE * RT_TEX_SIZE number of voxels
// 512x512 = 64x64x64 = 262,114 voxels
const RT_TEX_SIZE = 512;

const SCULPT_SIZE = 64;

const SCULPT_LAYERS = 8;

// Maximum number of cubes in a buffer
// for 36 tri indices in 16-bit array : 1820*36 < 2^16
const MAX_PER_BUFFER = 1820;


function tutorialOff()
{
    document.getElementById("overlayTutorial").style.display = "none";
}

//
// start
//
// called when body loads
// sets everything up
//
function start() {

    document.getElementById("overlayTutorial").style.display = "block";

    canvas = document.getElementById("glcanvas");

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    
    initWebGL(canvas);

    // only continue if webgl is working properly
    if (gl) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
        gl.clearDepth(1.0);                 // Clear everything
        gl.enable(gl.DEPTH_TEST);           // Enable depth testing
        gl.depthFunc(gl.LEQUAL);            // Near things obscure far things
        
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        gl.disable(gl.BLEND);

        initBuffers();  
        initParticleData();      
        initMaterials();
        initUI();
        
        canvas.onmousedown = handleMouseDown;
        canvas.oncontextmenu = handleRightClick;
        document.onmouseup = handleMouseUp;
        document.onmousemove = handleMouseMove;
        document.onmousewheel = handleMouseWheel;
        //document.ontouchstart = handleTouchStart;
        //document.ontouchmove = handleTouchMove;
        document.body.addEventListener('touchmove', function(event) {
            event.preventDefault();
            handleTouchMove(event);
        }, false); 

        document.body.addEventListener('touchstart', function(event) {
            event.preventDefault();
            handleTouchStart(event);
        }, false); 
        
        // start the core loop cycle
        requestAnimationFrame(tick);     
    }
    else
    {
        alert("sorry, your browser/device does not support the webgl compabilities this application needs.")
    }
}

//
// initWebGL
//
// initialize WebGL, returning the GL context or null if
// WebGL isn't available or could not be initialized.
//
function initWebGL() {
    gl = null;

    try {
        gl = canvas.getContext("experimental-webgl", { alpha: false });
    }
    catch(e) {
    }

    // If we don't have a GL context, give up now

    if (!gl) {
        alert("Unable to initialize WebGL. Your browser may not support it.");
    }
}


//
// initBuffers
//
// creates batched buffers to hold
// maximum number of cubes
//
function initBuffers() 
{
    //maxium particles that can be represented in the textures
    var maxparticleCount = RT_TEX_SIZE * RT_TEX_SIZE;
    
    particleCount = maxparticleCount;
  
    bufferCount = Math.ceil( maxparticleCount / MAX_PER_BUFFER );
  
    cubeVerticesBuffers.length = bufferCount;
    
    console.log("bufferCount: " + bufferCount );
  
  
    for( var b = 0; b < bufferCount; b++ )
    {
        cubeVerticesBuffers[b] = gl.createBuffer();
    
        // setup batched vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffers[b]);
    
        var batchedVertices = [];
        batchedVertices.length = vertices.length * Math.min( MAX_PER_BUFFER, maxparticleCount - b * MAX_PER_BUFFER );
    
        // each cube in buffer will be spaced out on xz grid - so shader can differentiate between them
        for(var i=0; i < batchedVertices.length; i+=3 )
        {
            var index = i % vertices.length;
            var pos = vertices.slice(index,index + 3);
      
            // index of cube out of all cubes through all buffers
            var cubedex = Math.floor( ( i + b * MAX_PER_BUFFER * vertices.length ) / vertices.length );
      
            pos[0] = pos[0] + ( cubedex % SCULPT_SIZE ) * 2;
            pos[1] = pos[1] + Math.floor( cubedex / ( SCULPT_SIZE * SCULPT_SIZE ) ) * 2;
            pos[2] = pos[2] + Math.floor( ( cubedex / SCULPT_SIZE ) % SCULPT_SIZE ) * 2;
      
            batchedVertices[i] = pos[0];
            batchedVertices[i+1] = pos[1];
            batchedVertices[i+2] = pos[2];
        }

        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batchedVertices), gl.STATIC_DRAW);
    }
      

    cubeVerticesIndexBuffer = gl.createBuffer();    
      
    // setup batched elements
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVerticesIndexBuffer);


    var batchedElements = [];
    batchedElements.length = cubeVertexIndices.length * MAX_PER_BUFFER;
  
    for( var i=0; i < batchedElements.length; i++ )
    {
        var index = i % cubeVertexIndices.length;
    
        // index of cube out of cubes in this current buffer
        var cubedex = Math.floor( i / cubeVertexIndices.length );
    
        batchedElements[i] = cubeVertexIndices[index] + cubedex * vertices.length / 3; // 8 vertex points in a cube - aka ( vertices / 3 )
    }

    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(batchedElements), gl.STATIC_DRAW);
}


//
// initParticleData
//
// initializes framebuffers, render textures, and materials
//
function initParticleData() 
{
    var extensions = gl.getSupportedExtensions();

    console.log(extensions);

    gl.getExtension('WEBGL_depth_texture');

    var texelData = gl.UNSIGNED_BYTE;
 
    
    // setup framebuffer to render voxel colors & visibility into texture : rgb = xyz, a = visibility
    rtVoxBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtVoxBuffer);
  
    rtVoxBuffer.width = RT_TEX_SIZE;
    rtVoxBuffer.height = RT_TEX_SIZE;
  
    rtVoxTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rtVoxTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RT_TEX_SIZE, RT_TEX_SIZE, 0, gl.RGBA, texelData, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtVoxTexture, 0);
  
  

    // setup framebuffer as intermediate - to copy content
    rtCopyBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtCopyBuffer);
  
    rtCopyBuffer.width = RT_TEX_SIZE;
    rtCopyBuffer.height = RT_TEX_SIZE;
  
    rtCopyTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rtCopyTexture );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RT_TEX_SIZE, RT_TEX_SIZE, 0, gl.RGBA, texelData, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtCopyTexture, 0);


    rtScrPosBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtScrPosBuffer);

    rtScrPosBuffer.width = canvas.width;
    rtScrPosBuffer.height = canvas.height;

    rtScrPosTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rtScrPosTexture );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rtScrPosBuffer.width, rtScrPosBuffer.height, 0, gl.RGBA, texelData, null); // only need 8 bit precision since only 64x64x64 voxels
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtScrPosTexture, 0);

    rtScrDepthTexture = gl.createTexture();
    gl.bindTexture( gl.TEXTURE_2D, rtScrDepthTexture );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, rtScrPosBuffer.width, rtScrPosBuffer.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, rtScrDepthTexture, 0);


    rtShadowBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtShadowBuffer);
    
    rtShadowBuffer.width = RT_TEX_SIZE;
    rtShadowBuffer.height = RT_TEX_SIZE;

    rtShadowTexture = gl.createTexture();
    gl.bindTexture( gl.TEXTURE_2D, rtShadowTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rtShadowBuffer.width, rtShadowBuffer.height, 0, gl.RGBA, texelData, null); // only need 8 bit precision since only 64x64x64 voxels
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtShadowTexture, 0);


    // create buffers for rendering images on quads
    frameVerticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, frameVerticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadVertices), gl.STATIC_DRAW);
  
    frameIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frameIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(quadVertexIndices), gl.STATIC_DRAW);
  
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    
    // setup data materials
    var quadVS = getShader(gl, "screenquad-vs");
    var sculptFS = getShader(gl, "sculpt2-fs");
    var copyFS = getShader(gl, "copy-fs");       
    var paintFS = getShader(gl, "paint2-fs" );
    var composeFS = getShader(gl, "compose-fs");
    
    toolShaders.length = 2;
    
    toolShaders[0] = gl.createProgram();
    gl.attachShader(toolShaders[0], quadVS);
    gl.attachShader(toolShaders[0], sculptFS);
    gl.linkProgram(toolShaders[0]);
    
    toolShaders[1] = gl.createProgram();
    gl.attachShader(toolShaders[1], quadVS );
    gl.attachShader(toolShaders[1], paintFS );
    gl.linkProgram(toolShaders[1]);
    
    
    // material to update voxels
    toolDataMaterial = new Material(null, null);   
    toolDataMaterial.setShader(toolShaders[0]);
    toolDataMaterial.setTexture("uVoxTex", rtVoxTexture );
    toolDataMaterial.setTexture("uPosTex", rtScrPosTexture);
    toolDataMaterial.setVec3("uSculptPos", new Float32Array([0.0, 0.0, 200.0]));
    toolDataMaterial.setVec3("uSculptDir", new Float32Array([0.4, 0.2, -1.0 ]));
    toolDataMaterial.addVertexAttribute("aVertexPosition");
    toolDataMaterial.setFloat("uRadius", 0.05 );
    toolDataMaterial.setFloat("cubeSize", SCULPT_SIZE);
    toolDataMaterial.setFloat("layersPerRow", SCULPT_LAYERS);
    toolDataMaterial.setFloat("imageSize", RT_TEX_SIZE);
    toolDataMaterial.setVec2("uCanvasSize", new Float32Array([canvas.width, canvas.height]));
    toolDataMaterial.setVec3("uToolColor", new Float32Array([1.0, 0.0, 0.0]));
    
    
    
    // material to copy 1 texture into another
    copyMaterial = new Material(quadVS, copyFS);   
    copyMaterial.setTexture("uCopyTex", rtCopyTexture );
    copyMaterial.addVertexAttribute("aVertexPosition");
    copyMaterial.setFloat("cubeSize", SCULPT_SIZE);
    copyMaterial.setFloat("layersPerRow", SCULPT_LAYERS);
    copyMaterial.setFloat("imageSize", RT_TEX_SIZE);


    composeMaterial = new Material(quadVS, composeFS);
    composeMaterial.setTexture("uVoxTexture", rtVoxTexture);
    composeMaterial.setTexture("uPosTex", rtScrPosTexture);
    composeMaterial.addVertexAttribute("aVertexPosition");
    composeMaterial.setFloat("cubeSize", SCULPT_SIZE);
    composeMaterial.setFloat("layersPerRow", SCULPT_LAYERS);
    composeMaterial.setFloat("imageSize", RT_TEX_SIZE);

    
    // initialize data into vox texture
    var initPosFS = getShader(gl, "initdata-fs");
    var initDataMaterial = new Material( quadVS, initPosFS );
    initDataMaterial.addVertexAttribute("aVertexPosition");
    initDataMaterial.setFloat("cubeSize", SCULPT_SIZE);
    initDataMaterial.setFloat("layersPerRow", SCULPT_LAYERS);
    initDataMaterial.setFloat("imageSize", RT_TEX_SIZE);
    
    gl.viewport(0, 0, RT_TEX_SIZE, RT_TEX_SIZE);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    
    renderDataBuffer( rtVoxBuffer, initDataMaterial );
    
    //renderDataBuffer( rtVoxBuffer, toolDataMaterial );
    
    gl.bindFramebuffer( gl.FRAMEBUFFER, null ); 
    gl.viewport(0, 0, canvas.width, canvas.height);
}

//
// initMaterials
//
// Initializes materials for cubes
//
function initMaterials() 
{
    voxelMaterials.length = 1;
        
    
    var basicVS = getShader(gl, "basic-vs" );  
    var voxelFS = getShader(gl, "voxel-fs" );
    var wireframeFS = getShader(gl, "cubeframe-fs");
    var positionFS = getShader(gl, "position-fs");

    voxelMaterials[0] = new Material( basicVS, positionFS );
    
    
    
    mat4.perspective(perspectiveMatrix, 45, canvas.width/canvas.height, 0.1, 1000.0);
    
    cameraPosition = vec3.fromValues(0, 0, -100 );
    cameraRotation = quat.create();
    cameraUp = vec3.fromValues(0.0, 1.0, 0.0 );
    
    mat4.fromRotationTranslation( vMatrix, cameraRotation, cameraPosition );
    

    for( var i=0; i < voxelMaterials.length; i++ )
    {
        voxelMaterials[i].setTexture("uVoxTex", rtVoxTexture );
        voxelMaterials[i].addVertexAttribute("aVertexPosition");
        voxelMaterials[i].setMatrix("uPMatrix", new Float32Array( perspectiveMatrix ) );
        voxelMaterials[i].setMatrix("uVMatrix", new Float32Array( vMatrix ) );
        voxelMaterials[i].setMatrix("uNormalMatrix", new Float32Array( normalMatrix ) );
        voxelMaterials[i].setFloat("cubeSize", SCULPT_SIZE);
        voxelMaterials[i].setFloat("layersPerRow", SCULPT_LAYERS);
        voxelMaterials[i].setFloat("imageSize", RT_TEX_SIZE);
    }

    toolDataMaterial.setMatrix("uVMatrix", new Float32Array( vMatrix ) );
    toolDataMaterial.setMatrix("uPMatrix", new Float32Array( perspectiveMatrix ) );
}

//
// initUI
//
// sets up ui sliders
//
function initUI()
{    
    document.getElementById('fileItem').addEventListener('change', handleLoadImage, false);
}

function handleLoadImage( evt ) {
   var files = evt.target.files;
   var f = files[0];
   
    // Only process image files.
    if (!f.type.match('image.*')) {
        return;
    }

    var reader = new FileReader();
    
    reader.onload = (function(theFile) {
        return function(e) {
            loadVoxelTexture( e.target.result );
        };
    })(f);

    reader.readAsDataURL(f);
}

function loadVoxelTexture(dataSource) {
    cubeTexture = gl.createTexture();
    cubeImage = new Image();
    cubeImage.onload = function() { handleTextureLoaded(cubeImage, cubeTexture); }
    cubeImage.src = dataSource;
}

function handleTextureLoaded(image, texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
  
    blit(texture, rtVoxBuffer, RT_TEX_SIZE, RT_TEX_SIZE );
}



function blit( texture, renderBuffer, viewWidth, viewHeight )
{
    gl.viewport(0, 0, viewWidth, viewHeight);
    gl.bindBuffer(gl.ARRAY_BUFFER, frameVerticesBuffer);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);  
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frameIndexBuffer);
    
    copyMaterial.setTexture("uCopyTex", texture );
    gl.bindFramebuffer( gl.FRAMEBUFFER, renderBuffer );
    gl.clear( gl.COLOR_BUFFER_BIT );
  
    copyMaterial.apply();
    
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);    
    
    copyMaterial.setTexture("uCopyTex", rtCopyTexture );
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null );
    gl.viewport(0, 0, canvas.width, canvas.height);
}

//
// renderDataBuffer
//
// takes a framebuffer and material
// renders a quad with the dataMaterial into the dataBuffer
// using a buffer inbetween so it can use it's previous frame texture as data
//
function renderDataBuffer( dataBuffer, dataMaterial )
{
    // setup quad geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, frameVerticesBuffer);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);  
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frameIndexBuffer);
    
    
    // render data into copy texture
    gl.bindFramebuffer( gl.FRAMEBUFFER, rtCopyBuffer );
    gl.clear( gl.COLOR_BUFFER_BIT );
    
    dataMaterial.apply();
        
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    
    
    // render copy texture into data texture
    gl.bindFramebuffer( gl.FRAMEBUFFER, dataBuffer );
    gl.clear( gl.COLOR_BUFFER_BIT );
  
    copyMaterial.apply();
    
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  
}

//
// renderParticleData
//
// Renders updates into the voxel data texture
//
function renderParticleData(deltaTime) 
{
    gl.viewport(0, 0, RT_TEX_SIZE, RT_TEX_SIZE);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    
    toolDataMaterial.setFloat("uDeltaTime", deltaTime );

    renderDataBuffer( rtVoxBuffer, toolDataMaterial );
    
    //renderDataBuffer( null, toolDataMaterial );
  
    // reset framebuffer to screen
    gl.bindFramebuffer( gl.FRAMEBUFFER, null ); 
    gl.viewport(0, 0, canvas.width, canvas.height);
}

function renderShadows()
{
    var cameraView;
    mat4.fromRotationTranslation( cameraView, cameraRotation, cameraPosition );    
    
    voxelMaterials[voxelMaterialIndex].setMatrix("uVMatrix", vMatrix );
    toolDataMaterial.setMatrix("uVMatrix", vMatrix );
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtScrPosBuffer);
    gl.viewport( 0, 0, RT_TEX_SIZE, RT_TEX_SIZE);

    gl.clearColor( 1.0, 1.0, 1.0, 0.0);
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

    voxelMaterials[voxelMaterialIndex].apply();

    for( var b=0; b < bufferCount; b++ )
    {
        if( particleCount < b * MAX_PER_BUFFER )
        {
            break;
        }
    
        // Bind all cube vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffers[b]);
        gl.vertexAttribPointer(voxelMaterials[voxelMaterialIndex].getVertexAttribute("aVertexPosition"), 3, gl.FLOAT, false, 0, 0);

    
        var elementCount = Math.min( particleCount - b * MAX_PER_BUFFER, MAX_PER_BUFFER );
    
        // Draw the cubes.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVerticesIndexBuffer);
        gl.drawElements(gl.TRIANGLES, 36 * elementCount, gl.UNSIGNED_SHORT, 0);
    }

}

//
// render
//
// Draw the scene.
//
function render( deltaTime ) 
{ 

    

    gl.bindFramebuffer( gl.FRAMEBUFFER, rtScrPosBuffer );
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.clearColor( 1.0, 1.0, 1.0, 0.0 );
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
 
    voxelMaterials[voxelMaterialIndex].apply();

    for( var b=0; b < bufferCount; b++ )
    {
        if( particleCount < b * MAX_PER_BUFFER )
        {
            break;
        }
    
        // Bind all cube vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffers[b]);
        gl.vertexAttribPointer(voxelMaterials[voxelMaterialIndex].getVertexAttribute("aVertexPosition"), 3, gl.FLOAT, false, 0, 0);

    
        var elementCount = Math.min( particleCount - b * MAX_PER_BUFFER, MAX_PER_BUFFER );
    
        // Draw the cubes.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVerticesIndexBuffer);
        gl.drawElements(gl.TRIANGLES, 36 * elementCount, gl.UNSIGNED_SHORT, 0);
    }

    //blit( rtScrPosTexture, null, canvas.width, canvas.height);

    if( currSculpting && (lastUpdateTime - lastActionTime) * 0.001 > 1.0 / brushSpeed)
    {
        renderParticleData( deltaTime );
        lastActionTime = lastUpdateTime;
    }
  


    gl.bindBuffer(gl.ARRAY_BUFFER, frameVerticesBuffer);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);  
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frameIndexBuffer);
    
    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
    gl.clear( gl.COLOR_BUFFER_BIT );
  
    composeMaterial.apply();
    
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);    
}

// 
// tick
//
// core loop function
// called every frame, updates & tells the scene to render
//
function tick( currentTime )
{
    var deltaTime = 0;
    if (lastUpdateTime) 
    {
        deltaTime = ( currentTime - lastUpdateTime ) * 0.001 * timeScale; // in seconds
        
        // prevent large animation jump from switching tabs/minimizing window
        if( deltaTime > 1.0 )
        {
            deltaTime = 0.0;
        }
            
    }
    lastUpdateTime = currentTime;
    
    resize();
    
    mat4.fromRotationTranslation( vMatrix, cameraRotation, cameraPosition );
    
    voxelMaterials[voxelMaterialIndex].setMatrix("uVMatrix", vMatrix );
    toolDataMaterial.setMatrix("uVMatrix", vMatrix );
    
    render( deltaTime );
    
    toolDataMaterial.setVec3("uLastDir", [sculptRay[0], sculptRay[1], sculptRay[2]]);
    toolDataMaterial.setVec3("uLastPos", [mouseCoord[0] * 0.5 + 0.5, mouseCoord[1] * 0.5 + 0.5, mouseCoord[2]]);
    requestAnimationFrame( tick );
}

//
// getShader
//
// loads a shader program by scouring the current document,
// looking for a script with the specified ID.
//
function getShader(gl, id) 
{
    var shaderScript = document.getElementById(id);

    // Didn't find an element with the specified ID; abort.
    if (!shaderScript) {
        return null;
    }

    // Walk through the source element's children, building the shader source string
    var theSource = "";
    var currentChild = shaderScript.firstChild;

    while(currentChild) {
        if (currentChild.nodeType == 3) {
            theSource += currentChild.textContent;
        }

        currentChild = currentChild.nextSibling;
    }

    // Now figure out what type of shader script we have, based on its MIME type.
    var shader;

    if (shaderScript.type == "x-shader/x-fragment") {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == "x-shader/x-vertex") {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        return null;  // Unknown shader type
    }

    gl.shaderSource(shader, theSource);

    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}

function resize() 
{

  var displayWidth  = window.innerWidth;
  var displayHeight = window.innerHeight;

  // Check if the canvas is not the same size.
  if (canvas.width  != displayWidth ||
      canvas.height != displayHeight) {

    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;

     mat4.perspective(perspectiveMatrix, 45, canvas.width/canvas.height, 0.1, 1000.0);
    
    for( var i=0; i < voxelMaterials.length; i++ )
    {
        voxelMaterials[i].setMatrix("uPMatrix", perspectiveMatrix );
    }

    toolDataMaterial.setMatrix("uPMatrix", perspectiveMatrix );
    
    // Set the viewport to match
    gl.viewport(0, 0, canvas.width,canvas.height);
  }
}

function cross(vecA, vecB ) {
    var vecC = [];
    vecC.length = 3;
    vecC[0] = vecA[1] * vecB[2] - vecA[2] * vecB[1];
    vecC[1] = vecA[2] * vecB[0] - vecA[0] * vecB[2];
    vecC[2] = vecA[0] * vecB[1] - vecA[1] * vecB[0];
    
    return vecC;
}

function handlePointerMove(event, newX, newY, sculpt, rotate, zoomAmount) {
    

    var deltaX = newX - lastMouseX;
    var deltaY = newY - lastMouseY;

    if( zoomAmount == null )
    {
        zoomAmount = deltaX + deltaY;
    }


    if( zoomAmount )
    {
        handleZoom(zoomAmount);
    }
    
    if( rotate )
    {
    
        var verticalRot = quat.create();
        quat.rotateX(verticalRot, verticalRot, ( deltaY / window.innerHeight ) * 30.0 );
        
        var horizontalRot = quat.create();
        quat.rotateY(horizontalRot, horizontalRot, ( deltaX / window.innerWidth ) * 30.0 );
        
        quat.multiply( cameraRotation, horizontalRot, cameraRotation );
        quat.multiply( cameraRotation, verticalRot, cameraRotation );
        
        vec3.transformQuat(cameraForward, vec3.fromValues(0.0, 0.0, -1.0 ), cameraRotation );
        vec3.normalize(cameraForward, cameraForward );
        vec3.cross( cameraRight, cameraForward, cameraUp );
        vec3.normalize(cameraRight, cameraRight );
        vec3.cross( cameraUp, cameraRight, cameraForward );
        vec3.normalize(cameraUp, cameraUp );
        //console.log("camera forward: " + cameraForward + "     right: " + cameraRight + "  up: " + cameraUp );
    }

    
    if( sculpt)
    {
        var nX = ( newX / window.innerWidth) * 2.0 - 1.0;
        var nY = 1.0 - ( newY / window.innerHeight ) * 2.0;
        
        setupSculpt(nX, nY );
    }

    currSculpting = sculpt;
    

    lastMouseX = newX;
    lastMouseY = newY;
}

function handlePointerStart(event, sculpt, rotate, zoom)
{    
    if( sculpt )
    {
        var nX = ( (lastMouseX / window.innerWidth) ) * 2.0 - 1.0;
        var nY = 1.0 - ( lastMouseY / ( window.innerHeight ) ) * 2.0;
        
        setupSculpt(nX, nY );
        lastActionTime = 0.0;
        
        toolDataMaterial.setVec3("uLastDir", [sculptRay[0], sculptRay[1], sculptRay[2]]);
        toolDataMaterial.setVec3("uLastPos", [mouseCoord[0] * 0.5 + 0.5, mouseCoord[1] * 0.5 + 0.5, mouseCoord[2]]);

        handlePointerMove(event, lastMouseX, lastMouseY, true, false, 0);

        currSculpting = true;
    }
    
}

function handleMouseDown(event) {
    
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    var rightclick;
    if (event.which) rightclick = (event.which == 3);
    else if (event.button) rightclick = (event.button == 2);

    if( rightclick )
    {
        rightDown = true;
    }
    else
    {
        leftDown = true;
    }
    
    var altKey = event.altKey == 1;
    
    var sculpting = (!rightclick && !altKey);
    var rotating = (!rightclick && altKey) || ( rightclick && !altKey);
    var zooming = (rightclick && altKey);
    
    
    handlePointerStart(event, 
        sculpting,
        rotating,
        zooming
    );
}

function handleMouseUp(event) {
    var rightclick;
    if (event.which) rightclick = (event.which == 3);
    else if (event.button) rightclick = (event.button == 2);

    var altKey = event.altKey == 1;
    
    var sculpting = (!rightclick && !altKey);
    var rotating = (!rightclick && altKey) || ( rightclick && !altKey);
    var zooming = (rightclick && altKey);
    
    if( !rightclick )
    {
        leftDown = false;
    }
    else
    {
        rightDown = false;
    }

    if( sculpting )
    {
        currSculpting = false;
    }
}

function handleMouseMove(event) {
    if (!( leftDown || rightDown )) {
        return;
    }

    var altKey = event.altKey == 1;

    var sculpting = (leftDown && !altKey);
    var rotating = (leftDown && altKey) || ( rightDown && !altKey);
    var zooming = (rightDown && altKey);

    handlePointerMove(event, event.clientX, event.clientY, 
    sculpting, 
    rotating, 
    zooming ? null : 0
    );
}

function handleZoom(delta)
{
    var currentZ = cameraPosition[2];

    currentZ += delta;

    if( currentZ < -500 )
    {
        currentZ = -500;
    }
    else if ( currentZ > -10 )
    {
        currentZ = -10;
    }

    cameraPosition[2] = currentZ;
}

function handleMouseWheel(event) 
{
    handleZoom( event.wheelDelta / 120 );
}

function handleRightClick(event) {
    event.preventDefault();
    return false;
}

var touches = []

function handleTouchStart(event) {
    touches = event.touches;

    

    var rightclick = false;

    if( touches.length == 1 )
    {
        lastMouseX = touches[0].clientX;
        lastMouseY = touches[0].clientY;
    }
    else if( touches.length == 2 )
    {
        rightclick = true;
        lastMouseX = (touches[1].clientX + touches[0].clientX) / 2.0;
        lastMouseY = (touches[1].clientY + touhces[0].clientY) / 2.0;

        lastTouchZoomX = touches[0].clientX; //touches[1].clientX - touches[0].clientX;
        lastTouchZoomY = touches[0].clientY; //touches[1].clientY - touches[0].clientY;
    }


    handlePointerStart(event, 
    touches.length == 1,
    touches.length == 2,
    touches.length == 2);
}


var lastTouchZoomX, lastTouchZoomY;

function handleTouchMove(event) {
    touches = event.touches;

    var newX, newY;

    if( touches.length  == 1 )
    {
        leftDown = true;
        rightDown = false;
        newX = touches[0].clientX / 1.0;
        newY = touches[0].clientY / 1.0;
        console.log("newXY " + newX + ", " + newY );
    }
    else if ( touches.length == 2 )
    {
        leftDown = false;
        rightDown = true;
        newX = touches[0].clientX; //(touches[1].clientX + touches[0].clientX) / 2.0;
        newY = touches[0].clientY; //(touches[1].clientY + touhces[0].clientY) / 2.0;
    }
    else
    {
        leftDown = false;
        rightDown = false;
        newX = lastMouseX;
        newY = lastMouseY;

        return;
    }

    var zoomDelta = 0;

    if( touches.length == 2 )
    {
        var distX = touches[1].clientX - touches[0].clientX;
        var distY = touches[1].clientY - touches[0].clientY;

        var deltaX = distX - lastTouchZoomX;
        var deltaY = distY - lastTouchZoomY;

        zoomDelta = deltaX + deltaY;

        lastTouchZoomX = distX;
        lastTouchZoomY = distY;
    }

    handlePointerMove(event, newX, newY, 
    touches.length == 1,
    touches.length == 2,
    zoomDelta
    );

    return false;
}

var sculptRay = [];  
var mouseCoord = [];

function setToolShader(index) {
    toolDataMaterial.setShader(toolShaders[index]);
}

function changeBrushSize() {
    var brushSize = document.getElementById("brushSize").value;

    brushSize = parseInt(brushSize);

    brushSize = ( brushSize / 200.0 );

    brushSize = ( brushSize * brushSize );

    toolDataMaterial.setFloat("uRadius", brushSize);
}

function changePaintColor() {
    var colorHex = document.getElementById("paintColorPicker").value;

    colorHex = "0x" + colorHex.slice(1);

    colorHex = parseInt(colorHex);

    var r = ( ( colorHex >> 16 ) & 0xFF )  / (0xFF * 1.0) ;
    var g = ( ( colorHex >> 8 ) & 0xFF )  / (0xFF * 1.0);
    var b = ( colorHex & 0xFF )  / (0xFF * 1.0);


    toolDataMaterial.setVec3("uToolColor", [r, g, b]);
}
    
function setupSculpt(nX, nY) {
        
    mouseCoord = vec4.fromValues( nX, nY, -1.0, 1.0);        
    var invMat = [];
    
    var vpMat = [];

    mat4.multiply(vpMat, perspectiveMatrix, vMatrix);

    mat4.invert(invMat, perspectiveMatrix );            
    mat4.multiply(sculptRay, invMat, mouseCoord );
    

    mat4.invert( invMat, vMatrix );       
    //sculptRay[3] = 0.0;       
    mat4.multiply(sculptRay, invMat, sculptRay);
    

    mat4.invert( invMat, cameraRotation );        
    var sculptPos = [];

    mat4.multiply( sculptPos, invMat, vec4.fromValues( -cameraPosition[0], -cameraPosition[1], -cameraPosition[2], 0.0 ) );
    

    toolDataMaterial.setVec3("uSculptDir", [sculptRay[0], sculptRay[1], sculptRay[2]]);
    toolDataMaterial.setVec3("uMousePos", [ mouseCoord[0] * 0.5 + 0.5, mouseCoord[1] * 0.5 + 0.5, mouseCoord[2]]);
    toolDataMaterial.setVec3("uSculptPos", [sculptPos[0], sculptPos[1], sculptPos[2]]); 
    toolDataMaterial.setVec3("uCamPos", [invMat[12], invMat[13], invMat[14]]);
}

var vMatrixStack = [];

function mvPushMatrix(m) {
  if (m) {
    vMatrixStack.push(m.dup());
    vMatrix = m.dup();
  } else {
    vMatrixStack.push(vMatrix.dup());
  }
}

function mvPopMatrix() {
  if (!vMatrixStack.length) {
    throw("Can't pop from an empty matrix stack.");
  }
  vMatrix = vMatrixStack.pop();
  return vMatrix;
}

var vertices = [
  -0.5, -0.5,  0.5,
    0.5, -0.5,  0.5,
    0.5,  0.5,  0.5,
  -0.5,  0.5,  0.5,

  -0.5, -0.5, -0.5,
  -0.5,  0.5, -0.5,
    0.5,  0.5, -0.5,
    0.5, -0.5, -0.5
];

var vertexNormals = [
  -0.57735, -0.57735,  0.57735,
    0.57735, -0.57735,  0.57735,
    0.57735,  0.57735,  0.57735,
  -0.57735,  0.57735,  0.57735,

  -0.57735, -0.57735, -0.57735,
  -0.57735,  0.57735, -0.57735,
    0.57735,  0.57735, -0.57735,
    0.57735, -0.57735, -0.57735

];

var textureCoordinates = [
  0.0,  0.0,
  1.0,  0.0,
  1.0,  1.0,
  0.0,  1.0,

  0.0,  0.0,
  1.0,  0.0,
  1.0,  1.0,
  0.0,  1.0

];

var cubeVertexIndices = [
    0,  1,  2,      0,  2,  3,    // front
    4,  5,  6,      4,  6,  7,    // back
    5,  3,  2,      5,  2,  6,   // top
    4,  7,  1,      4,  1,  0,   // bottom
    7,  6,  2,      7,  2,  1,   // right
    4,  0,  3,      4,  3,  5    // left
];

var quadVertices = [
  -1.0, -1.0,  -1.0,
    1.0, -1.0,  -1.0,
    1.0,  1.0,  -1.0,
  -1.0,  1.0,  -1.0,
];

var quadVertexIndices = [
    0,  1,  2,      
    0,  2,  3
];

var normalMatrix = [
    1, 0, 0, 0, 
    0, 1, 0, 20, 
    0, 0, 1, 100, 
    0, 0, 0, 1
];


