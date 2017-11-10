"use strict";
class Voxsculpt {

    // support for up to Voxsculpt.RT_TEX_SIZE * Voxsculpt.RT_TEX_SIZE number of voxels
    // 512x512 = 64x64x64 = 262,114 voxels
    static get RT_TEX_SIZE()
    {
        return 512;
    }

    static get SCULPT_SIZE()
    {
        return 64;
    }

    static get SCULPT_LAYERS()
    {
        return 8;
    }

    constructor()
    {
        
        this._cubeBatch = null; // batch of cubed voxels
 
        this._voxelMaterials = [];    // materials to render the voxels with
        this._voxelMaterialIndex = 0; // index of material currently used

        this._screenQuadMesh; // mesh to apply full-screen effects and blitting
        this._floorMesh;

        this._floorMaterial;

        this._rtScrPosBuffer = null; // framebuffer for rendering world postion of voxels
        this.rtCopyBuffer = null;   // framebuffer for copying framebuffer contents
        this.rtShadowBuffer = null; // framebuffer to render shadows
        this.rtVoxBuffer = null;

        // this.sculptDataProgram; // shader used for sculpting voxels
        // this.rtCopyProgram;     // shader just to copy texture

        this._toolDataMaterial;  // material to update voxels ( sculpting, painting, etc.)
        this._copyMaterial;      // material to copy texture
        this._composeMaterial;   // material that composes position and data textures into what is seen on screen

        this._toolShaders = [];  // array of shaders used to update voxels

        this._currSculpting = false; // is currently sculpting or not

        this._pMatrix = [];
        this._vMatrix = [];
        this._mMatrix = [];

        this._cameraRotation =  [];
        this._cameraPosition = [];

        this._modelRotation = [];
        this._modelPosition = [];

        this._cameraForward = [];
        this._cameraUp = [];
        this._cameraRight = [];

        this._brushSpeed = 60.0;

        this._lastActionTime = 0.0;
        this._actionUsed = false;

        this._lightPosition = [];
        this._lightRotation = [];

        this._lightPerspective = [];
        this._lightView = [];
        this._lightVP = [];
        this._lightMVP = [];

        this._shadowsEnabled = true;

    }

    //
    // initBuffers
    //
    // creates batched buffers to hold
    // maximum number of cubes
    //
    initBuffers() 
    {
        //maxium particles that can be represented in the textures
        var maxparticleCount = Voxsculpt.RT_TEX_SIZE * Voxsculpt.RT_TEX_SIZE;

        this._cubeBatch = new BatchedCubes(maxparticleCount, Voxsculpt.SCULPT_SIZE);
    }

    //
    // initParticleData
    //
    // initializes framebuffers, render textures, and materials
    //
    initParticleData() 
    {
        var texelData = gl.UNSIGNED_BYTE;
    
        // setup framebuffer to render voxel colors & visibility into texture : rgb = xyz, a = visibility
        this.rtVoxBuffer = new Framebuffer(
            new Texture(Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE, gl.RGBA, gl.RGBA, texelData ), null,
            Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE
        );

        // setup framebuffer as intermediate - to copy content
        this.rtCopyBuffer = new Framebuffer(
            new Texture(Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE, gl.RGBA, gl.RGBA, texelData ), null,
            Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE
        );

        //this._rtScrPosBuffer = gl.createFramebuffer();
        this.setupScreenBuffer();

        this.rtShadowBuffer = new Framebuffer(
            new Texture(Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE, gl.RGBA, gl.RGBA, texelData),
            new Texture(Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE, gl.DEPTH_COMPONENT, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT),
            Voxsculpt.RT_TEX_SIZE,
            Voxsculpt.RT_TEX_SIZE
        );

        this._screenQuadMesh = new Mesh(quadVertices, quadVertexIndices);
        this._floorMesh = new Mesh(floorVertices, floorIndices);
    
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        
        // setup data materials
        var quadVS = Material.getShader(gl, "screenquad-vs");
        var sculptFS = Material.getShader(gl, "sculpt2-fs");
        var copyFS = Material.getShader(gl, "copy-fs");       
        var paintFS = Material.getShader(gl, "paint2-fs" );
        var composeFS = Material.getShader(gl, "compose-fs");
        
        this._toolShaders.length = 2;
        
        this._toolShaders[0] = gl.createProgram();
        gl.attachShader(this._toolShaders[0], quadVS);
        gl.attachShader(this._toolShaders[0], sculptFS);
        gl.linkProgram(this._toolShaders[0]);
        
        this._toolShaders[1] = gl.createProgram();
        gl.attachShader(this._toolShaders[1], quadVS );
        gl.attachShader(this._toolShaders[1], paintFS );
        gl.linkProgram(this._toolShaders[1]);
        
        
        // material to update voxels
        this._toolDataMaterial = new Material(null, null);   
        this._toolDataMaterial.setShader(this._toolShaders[0]);
        this._toolDataMaterial.setTexture("uVoxTex", this.rtVoxBuffer.color().native() );
        this._toolDataMaterial.setTexture("uPosTex", this._rtScrPosBuffer.color().native());
        this._toolDataMaterial.setVec3("uSculptPos", new Float32Array([0.0, 0.0, 200.0]));
        this._toolDataMaterial.setVec3("uSculptDir", new Float32Array([0.4, 0.2, -1.0 ]));
        this._toolDataMaterial.addVertexAttribute("aVertexPosition");
        this._toolDataMaterial.setFloat("uRadius", 0.04 );
        this._toolDataMaterial.setFloat("cubeSize", Voxsculpt.SCULPT_SIZE);
        this._toolDataMaterial.setFloat("layersPerRow", Voxsculpt.SCULPT_LAYERS);
        this._toolDataMaterial.setFloat("imageSize", Voxsculpt.RT_TEX_SIZE);
        this._toolDataMaterial.setVec2("uCanvasSize", new Float32Array([canvas.width, canvas.height]));
        this._toolDataMaterial.setFloat("uAspect", canvas.height / canvas.width);
        this._toolDataMaterial.setVec3("uToolColor", new Float32Array([1.0, 0.68, 0.14]));
        
        
        // material to copy 1 texture into another
        this._copyMaterial = new Material(quadVS, copyFS);   
        this._copyMaterial.setTexture("uCopyTex", this.rtCopyBuffer.color().native() );
        this._copyMaterial.addVertexAttribute("aVertexPosition");
        this._copyMaterial.setFloat("cubeSize", Voxsculpt.SCULPT_SIZE);
        this._copyMaterial.setFloat("layersPerRow", Voxsculpt.SCULPT_LAYERS);
        this._copyMaterial.setFloat("imageSize", Voxsculpt.RT_TEX_SIZE);


        this._composeMaterial = new Material(quadVS, composeFS);
        this._composeMaterial.setTexture("uVoxTexture", this.rtVoxBuffer.color().native());
        this._composeMaterial.setTexture("uPosTex", this._rtScrPosBuffer.color().native());
        this._composeMaterial.setTexture("uShadowTex", this.rtShadowBuffer.depth().native());
        this._composeMaterial.addVertexAttribute("aVertexPosition");
        this._composeMaterial.setFloat("cubeSize", Voxsculpt.SCULPT_SIZE);
        this._composeMaterial.setFloat("layersPerRow", Voxsculpt.SCULPT_LAYERS);
        this._composeMaterial.setFloat("imageSize", Voxsculpt.RT_TEX_SIZE);
        this._composeMaterial.setFloat("uRadius", 0.04);
        this._composeMaterial.setFloat("uAspect", canvas.height / canvas.width);
        
        // initialize data into vox texture
        var initPosFS = Material.getShader(gl, "initdata-fs");
        var initDataMaterial = new Material( quadVS, initPosFS );
        initDataMaterial.addVertexAttribute("aVertexPosition");
        initDataMaterial.setFloat("cubeSize", Voxsculpt.SCULPT_SIZE);
        initDataMaterial.setFloat("layersPerRow", Voxsculpt.SCULPT_LAYERS);
        initDataMaterial.setFloat("imageSize", Voxsculpt.RT_TEX_SIZE);
        
        gl.viewport(0, 0, Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        
        this.renderDataBuffer( this.rtVoxBuffer.fbo(), initDataMaterial );
        
        //renderDataBuffer( this.rtVoxBuffer, this._toolDataMaterial );
        
        gl.bindFramebuffer( gl.FRAMEBUFFER, null ); 
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    //
    // initMaterials
    //
    // Initializes materials for cubes
    //
    initMaterials() 
    {
        this._voxelMaterials.length = 2;
            
        
        var basicVS = Material.getShader(gl, "basic-vs" );  
        var voxelFS = Material.getShader(gl, "voxel-fs" );
        var wireframeFS = Material.getShader(gl, "cubeframe-fs");
        var positionFS = Material.getShader(gl, "position-fs");
        var floorVS = Material.getShader(gl, "floor-vs");
        var floorFS = Material.getShader(gl, "floor-fs");

        this._voxelMaterials[0] = new Material( basicVS, positionFS );
        this._voxelMaterials[1] = new Material( basicVS, wireframeFS );
        this._floorMaterial = new Material(floorVS, floorFS);
        
        mat4.perspective(this._pMatrix, 45, canvas.width/canvas.height, 0.1, 1000.0);
        
        this._cameraRotation = quat.create();
        this._cameraPosition = vec3.fromValues(0, 0, -150 );
        this._cameraUp = vec3.fromValues(0.0, 1.0, 0.0 );

        this._modelRotation = quat.create();
        this._modelPosition = vec3.fromValues(0.0, 0.0, 0.0);
        
        
        mat4.fromRotationTranslation( this._vMatrix, this._cameraRotation, this._cameraPosition );
        mat4.fromRotationTranslation( this._mMatrix, this._modelRotation, this._modelPosition );
        

        for( var i=0; i < this._voxelMaterials.length; i++ )
        {
            this._voxelMaterials[i].setTexture("uVoxTex", this.rtVoxBuffer.color().native() );
            this._voxelMaterials[i].addVertexAttribute("aVertexPosition");
            this._voxelMaterials[i].setMatrix("uPMatrix", new Float32Array( this._pMatrix ) );
            this._voxelMaterials[i].setMatrix("uVMatrix", new Float32Array( this._vMatrix ) );
            this._voxelMaterials[i].setMatrix("uMMatrix", new Float32Array(this._mMatrix));
            this._voxelMaterials[i].setFloat("cubeSize", Voxsculpt.SCULPT_SIZE);
            this._voxelMaterials[i].setFloat("layersPerRow", Voxsculpt.SCULPT_LAYERS);
            this._voxelMaterials[i].setFloat("imageSize", Voxsculpt.RT_TEX_SIZE);
        }

        this._toolDataMaterial.setMatrix("uMMatrix", new Float32Array( this._mMatrix ) );
        this._toolDataMaterial.setMatrix("uVMatrix", new Float32Array( this._vMatrix ) );
        this._toolDataMaterial.setMatrix("uPMatrix", new Float32Array( this._pMatrix ) );

        this._floorMaterial.setMatrix("uVMatrix", new Float32Array( this._vMatrix ) );
        this._floorMaterial.setMatrix("uPMatrix", new Float32Array( this._pMatrix ) );

        this._lightPosition = vec3.fromValues( 0.0, 0.0, -85.0 );
        this._lightRotation = quat.create();
        
        quat.rotateX(this._lightRotation, this._lightRotation, 1.578);
        quat.rotateY(this._lightRotation, this._lightRotation, -0.9);
        quat.rotateX(this._lightRotation, this._lightRotation, -0.6);
        quat.rotateZ(this._lightRotation, this._lightRotation, -0.4);
        //quat.rotateZ(this._lightRotation, this._lightRotation, -0.6);
        
    
        //this._lightView = mat4.create();
        mat4.fromRotationTranslation( this._lightView, this._lightRotation, this._lightPosition ); 

        var orthoSize = 60;
        mat4.ortho( this._lightPerspective, -orthoSize, orthoSize, -orthoSize, orthoSize, 40.0, 250.0 );

        mat4.multiply(this._lightVP, this._lightPerspective, this._lightView);

        // mat4.multiply(this._lightMVP, this._lightVP, this._mMatrix );

        this._composeMaterial.setMatrix("uLightSpace", this._lightVP);
    }

    setupScreenBuffer()
    {
        var texelData = gl.UNSIGNED_BYTE;

        var colorTex = new Texture( canvas.width, canvas.height, gl.RGBA, gl.RGBA, texelData );
        var depthTex = new Texture(canvas.width, canvas.height, gl.DEPTH_COMPONENT, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
        
        if( this._rtScrPosBuffer )
        {
            this._rtScrPosBuffer.setup( colorTex, depthTex, canvas.width, canvas.height );
        }
        else
        {
            this._rtScrPosBuffer = new Framebuffer( colorTex, depthTex, canvas.width, canvas.height );
        }

        if( this._toolDataMaterial )
        {
            this._toolDataMaterial.setTexture("uPosTex", this._rtScrPosBuffer.color().native());
            this._toolDataMaterial.setVec2("uCanvasSize", new Float32Array([canvas.width, canvas.height]));
            this._toolDataMaterial.setFloat("uAspect", canvas.height / canvas.width);
        }

        if( this._composeMaterial )
        {
            this._composeMaterial.setTexture("uPosTex", this._rtScrPosBuffer.color().native());
            this._composeMaterial.setFloat("uAspect", canvas.height / canvas.width);
        }
    }

    blit( texture, renderBuffer, viewWidth, viewHeight )
    {
        gl.viewport(0, 0, viewWidth, viewHeight);

        this._copyMaterial.setTexture("uCopyTex", texture );
        gl.bindFramebuffer( gl.FRAMEBUFFER, renderBuffer );
        gl.clear( gl.COLOR_BUFFER_BIT );
    
        this._copyMaterial.apply();

        this._screenQuadMesh.render();
        
        this._copyMaterial.setTexture("uCopyTex", this.rtCopyBuffer.color().native() );
        
        Framebuffer.bindDefault();
    }

    handleTextureLoaded(image, texture) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);
    
        this.blit(texture, this.rtVoxBuffer.fbo(), Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE );
    }

    //
    // renderDataBuffer
    //
    // takes a framebuffer and material
    // renders a quad with the dataMaterial into the dataBuffer
    // using a buffer inbetween so it can use it's previous frame texture as data
    //
    renderDataBuffer( dataBuffer, dataMaterial )
    {    
        // render data into copy texture
        gl.bindFramebuffer( gl.FRAMEBUFFER, this.rtCopyBuffer.fbo() );
        gl.clear( gl.COLOR_BUFFER_BIT );
        
        dataMaterial.apply();     
        this._screenQuadMesh.render();  
        
        // render copy texture into data texture
        gl.bindFramebuffer( gl.FRAMEBUFFER, dataBuffer );
        gl.clear( gl.COLOR_BUFFER_BIT );
    
        this._copyMaterial.apply(); 
        this._screenQuadMesh.render(); 
    }

    //
    // renderParticleData
    //
    // Renders updates into the voxel data texture
    //
    renderParticleData(deltaTime) 
    {
        gl.viewport(0, 0, Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        
        this._toolDataMaterial.setFloat("uDeltaTime", deltaTime );

        this.renderDataBuffer( this.rtVoxBuffer.fbo(), this._toolDataMaterial );
        
        Framebuffer.bindDefault();
    }

    renderShadows()
    { 
        var shadowMatIndex = this._voxelMaterialIndex;

        this._voxelMaterials[shadowMatIndex].setMatrix("uPMatrix", this._lightPerspective);
        this._voxelMaterials[shadowMatIndex].setMatrix("uVMatrix", this._lightView );

        this._floorMaterial.setMatrix("uPMatrix", this._lightPerspective);
        this._floorMaterial.setMatrix("uVMatrix", this._lightView );

        this.rtShadowBuffer.bind();

        gl.clearColor( 0.0, 0.0, 0.0, 1.0);
        gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

        this._voxelMaterials[shadowMatIndex].apply();
        this._cubeBatch.render( );

        this._voxelMaterials[shadowMatIndex].setMatrix("uVMatrix", this._vMatrix );
        this._voxelMaterials[shadowMatIndex].setMatrix("uPMatrix", this._pMatrix);

        this._floorMaterial.setMatrix("uPMatrix", this._pMatrix);
        this._floorMaterial.setMatrix("uVMatrix", this._vMatrix );

        Framebuffer.bindDefault();
    }


    debugShadowBuffer()
    {   
        gl.bindFramebuffer( gl.FRAMEBUFFER, null );
        gl.viewport(0, 0, 512, 512);
        //gl.clear( gl.COLOR_BUFFER_BIT );
    
        this._copyMaterial.setTexture("uCopyTex", this.rtShadowBuffer.color().native() );
        this._copyMaterial.apply();   
        this._screenQuadMesh.render();
        
        this._copyMaterial.setTexture("uCopyTex", this.rtCopyBuffer.color().native() );
        //blit( rtShadowTexture, null, 512, 512);
    }



    init()
    {
        this.initBuffers();  
        this.initParticleData();      
        this.initMaterials();
    }

    update()
    {
        mat4.fromRotationTranslation( this._vMatrix, this._cameraRotation, this._cameraPosition);
        mat4.fromRotationTranslation( this._mMatrix, this._modelRotation, this._modelPosition );
        
        this._voxelMaterials[this._voxelMaterialIndex].setMatrix("uMMatrix", this._mMatrix );
        this._toolDataMaterial.setMatrix("uMMatrix", this._mMatrix );
        this._composeMaterial.setMatrix("uCubeMat", this._mMatrix);
    
        this._voxelMaterials[this._voxelMaterialIndex].setMatrix("uVMatrix", this._vMatrix );
        this._toolDataMaterial.setMatrix("uVMatrix", this._vMatrix );
        this._floorMaterial.setMatrix("uVMatrix", this._vMatrix);

        // mat4.multiply(this._lightMVP, this._lightVP, this._mMatrix );

        // this._composeMaterial.setMatrix("uLightSpace", this._lightMVP);        
    }

    postUpdate()
    {
        //this._toolDataMaterial.setVec3("uLastDir", [sculptRay[0], sculptRay[1], sculptRay[2]]);
        this._toolDataMaterial.setVec3("uLastPos", [mouseCoord[0] * 0.5 + 0.5, mouseCoord[1] * 0.5 + 0.5, mouseCoord[2]]);
    }


    render()
    {
        this._rtScrPosBuffer.bind();

        gl.clearColor( 1.0, 1.0, 1.0, 0.0 );
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
        this._voxelMaterials[this._voxelMaterialIndex].apply();
        this._cubeBatch.render();

        this._floorMaterial.apply();
        this._floorMesh.render();

        if( this._currSculpting && (Time.lastFrameTime - this._lastActionTime) * 0.001 > 1.0 / this._brushSpeed)
        {
            this.renderParticleData( Time.deltaTime );
            this._lastActionTime = Time.lastFrameTime;
        }
    
        if( this._shadowsEnabled )
        {
            this.renderShadows();
        }      
    
        gl.bindFramebuffer( gl.FRAMEBUFFER, null );
        gl.clear( gl.COLOR_BUFFER_BIT );
    
        this._composeMaterial.apply();
        this._screenQuadMesh.render();

        //this.debugShadowBuffer();
    }

    handleResize()
    {
        mat4.perspective(this._pMatrix, 45, canvas.width/canvas.height, 0.1, 1000.0);
    
        for( var i=0; i < this._voxelMaterials.length; i++ )
        {
            this._voxelMaterials[i].setMatrix("uPMatrix", this._pMatrix );
        }

        this._toolDataMaterial.setMatrix("uPMatrix", this._pMatrix );
        
        // Set the viewport to match
        gl.viewport(0, 0, canvas.width,canvas.height);

        this.setupScreenBuffer();
    }

    handleZoom(delta)
    {
        var currentZ = this._cameraPosition[2];

        currentZ += delta;

        if( currentZ < -500 )
        {
            currentZ = -500;
        }
        else if ( currentZ > -10 )
        {
            currentZ = -10;
        }

        this._cameraPosition[2] = currentZ;
    }

    handleRotate(dX, dY )
    {
        var verticalRot = quat.create();
        quat.rotateX(verticalRot, verticalRot, dY * 30.0 );
        
        var horizontalRot = quat.create();
        quat.rotateY(horizontalRot, horizontalRot, dX * 30.0 );
        
        quat.multiply( this._modelRotation, horizontalRot, this._modelRotation );
        quat.multiply( this._modelRotation, verticalRot, this._modelRotation );
        
        vec3.transformQuat(this._cameraForward, vec3.fromValues(0.0, 0.0, -1.0 ), this._modelRotation );
        vec3.normalize(this._cameraForward, this._cameraForward );
        vec3.cross( this._cameraRight, this._cameraForward, this._cameraUp );
        vec3.normalize(this._cameraRight, this._cameraRight );
        vec3.cross( this._cameraUp, this._cameraRight, this._cameraForward );
        vec3.normalize(this._cameraUp, this._cameraUp );
    }

    handleToolUse(nX, nY)
    {      
        var invMat = [];

        var mvMat = [];
        mat4.multiply(mvMat, this._vMatrix, this._mMatrix );
        mat4.invert( invMat, mvMat );       
    
        var sculptPos = [];

        mat4.multiply( sculptPos, invMat, vec4.fromValues( -this._cameraPosition[0], -this._cameraPosition[1], -this._cameraPosition[2], 0.0 ) );
        
        this._toolDataMaterial.setVec3("uMousePos", [ nX * 0.5 + 0.5, nY * 0.5 + 0.5, -1.0]);
        this._toolDataMaterial.setVec3("uSculptPos", [sculptPos[0], sculptPos[1], sculptPos[2]]); 
        this._toolDataMaterial.setVec3("uCamPos", [invMat[12], invMat[13], invMat[14]]);  

            
    }

    handleMouseMove(nX, nY)
    {
        this._composeMaterial.setVec3("uMousePos", [ nX * 0.5 + 0.5, nY * 0.5 + 0.5, -1.0]);
    }

    startToolUse(mouseCoord)
    {
        this._lastActionTime = 0.0;
        this._toolDataMaterial.setVec3("uLastPos", [mouseCoord[0] * 0.5 + 0.5, mouseCoord[1] * 0.5 + 0.5, mouseCoord[2]]);
    }

    setToolUse(inUse)
    {
        this._currSculpting = inUse;
    }

    setToolShader(index) {
        this._toolDataMaterial.setShader(this._toolShaders[index]);
    }

    changeBrushSize(brushSize) {
        this._toolDataMaterial.setFloat("uRadius", brushSize);
        this._composeMaterial.setFloat("uRadius", brushSize);
    }

    changePaintColor(colorHex) {
        colorHex = "0x" + colorHex.slice(1);

        colorHex = parseInt(colorHex);

        var r = ( ( colorHex >> 16 ) & 0xFF )  / (0xFF * 1.0) ;
        var g = ( ( colorHex >> 8 ) & 0xFF )  / (0xFF * 1.0);
        var b = ( colorHex & 0xFF )  / (0xFF * 1.0);


        this._toolDataMaterial.setVec3("uToolColor", [r, g, b]);
    }

    setVoxelMaterialIndex(materialIndex) {
        this._voxelMaterialIndex = materialIndex;
    }

    getVoxTextureCPU() {
        this.rtVoxBuffer.bind();
        var pixels = new Uint8Array(Voxsculpt.RT_TEX_SIZE*Voxsculpt.RT_TEX_SIZE*4);

        gl.readPixels(0, 0, Voxsculpt.RT_TEX_SIZE, Voxsculpt.RT_TEX_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        Framebuffer.bindDefault();

        return pixels;
    }

    enableShadows(enabled)
    {
        this._shadowsEnabled = enabled;

        if(!this._shadowsEnabled )
        {
            this.rtShadowBuffer.bind();
            
            gl.clearColor( 0.0, 0.0, 0.0, 1.0);
            gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

            Framebuffer.bindDefault();
        }
    }

}

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


var floorVertices = [
    -128.0, -64.0, -128.0,
    -128.0, -64.0, 128.0,
    128.0, -64.0, 128.0,
    128.0, -64.0, -128.0
];

var floorIndices = quadVertexIndices;

