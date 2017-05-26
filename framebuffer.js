"use strict";
class Framebuffer {
    constructor( color, depth, width, height)
    {
        this._fbo = gl.createFramebuffer();
        
        this.setup( color, depth, width, height);
    }


    setup(color, depth, width, height)
    {
        this._color      = color;
        this._depth      = depth;
        this._width      = width;
        this._height     = height;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo );

        this._fbo.width  = this._width;
        this._fbo.height = this._height;

        if( this._color )
        {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._color.native(), 0);
        }

        if ( this._depth )
        {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._depth.native(), 0);
        }
    }

    color()
    {
        return this._color;
    }

    depth()
    {
        return this._depth;
    }

    fbo()
    {
        return this._fbo;
    }


    bind()
    {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo );
        gl.viewport(0, 0, this._width, this._height);
    }

    static bindDefault()
    {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
    }


}