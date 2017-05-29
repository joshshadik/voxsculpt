"use strict";
class Time {
    static instance()
    {
    }

    constructor()
    {
        Time.instance = this;
        this._deltaTime = 0.0;
        this._currentTime = 0.0;
        this._lastFrameTime = 0.0;
        
    }
    
    update( currTime )
    {
        this._currentTime = currTime;

        var dt = 0;
        if (this._lastFrameTime) 
        {
            dt = ( this._currentTime - this._lastFrameTime ) * 0.001; // in seconds
            
            // prevent large animation jump from switching tabs/minimizing window
            if( dt > 1.0 )
            {
                dt = 0.0;
            }
                
        }

        this._deltaTime = dt;

        this._lastFrameTime = this._currentTime;
    }

    static get deltaTime()
    {
        return Time.instance._deltaTime;
    }

    static get currentTime()
    {
        return Time.instance._currentTime;
    }

    static get lastFrameTime()
    {
        return Time.instance._lastFrameTime;
    }
}