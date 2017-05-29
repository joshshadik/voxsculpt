"use strict";
class Texture {
    constructor( width, height, internalFormat = gl.RGBA, format = gl.RGBA, type = gl.UNSIGNED_BYTE, magFilter = gl.NEAREST, minFilter = gl.NEAREST, wrapS = gl.CLAMP_TO_EDGE, wrapT = gl.CLAMP_TO_EDGE )
    {
        this.nativeTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.nativeTexture );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
    }

    native()
    {
        return this.nativeTexture;
    }
}