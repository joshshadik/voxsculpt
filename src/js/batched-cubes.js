"use strict";
class BatchedCubes { 
    
    // Maximum number of cubes in a buffer
    // for 36 tri indices in 16-bit array : 1820*36 < 2^16
    static get MAX_PER_BUFFER()
    {
        return 1820;
    }

    constructor(maxparticleCount, blockSize)
    {
        
        this._vertexBuffers = [];
        this._indexBuffer = null;
        this._bufferCount = 0;
        this._maxCubes = maxparticleCount;

        const vertices = [
            -0.5, -0.5,  0.5,
            0.5, -0.5,  0.5,
            0.5,  0.5,  0.5,
            -0.5,  0.5,  0.5,

            -0.5, -0.5, -0.5,
            -0.5,  0.5, -0.5,
            0.5,  0.5, -0.5,
            0.5, -0.5, -0.5
        ];

        const vertexNormals = [
            -0.57735, -0.57735,  0.57735,
            0.57735, -0.57735,  0.57735,
            0.57735,  0.57735,  0.57735,
            -0.57735,  0.57735,  0.57735,

            -0.57735, -0.57735, -0.57735,
            -0.57735,  0.57735, -0.57735,
            0.57735,  0.57735, -0.57735,
            0.57735, -0.57735, -0.57735

        ];

        const textureCoordinates = [
            0.0,  0.0,
            1.0,  0.0,
            1.0,  1.0,
            0.0,  1.0,

            0.0,  0.0,
            1.0,  0.0,
            1.0,  1.0,
            0.0,  1.0

        ];

        const cubeVertexIndices = [
            0,  1,  2,      0,  2,  3,    // front
            4,  5,  6,      4,  6,  7,    // back
            5,  3,  2,      5,  2,  6,   // top
            4,  7,  1,      4,  1,  0,   // bottom
            7,  6,  2,      7,  2,  1,   // right
            4,  0,  3,      4,  3,  5    // left
        ];

        this._bufferCount = Math.ceil( maxparticleCount / BatchedCubes.MAX_PER_BUFFER );
  
        this._vertexBuffers.length = this._bufferCount;
    
        for( var b = 0; b < this._bufferCount; b++ )
        {
            this._vertexBuffers[b] = gl.createBuffer();
        
            // setup batched vertex buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffers[b]);
        
            var batchedVertices = [];
            batchedVertices.length = vertices.length * Math.min( BatchedCubes.MAX_PER_BUFFER, maxparticleCount - b * BatchedCubes.MAX_PER_BUFFER );
        
            // each cube in buffer will be spaced out on xz grid - so shader can differentiate between them
            for(var i=0; i < batchedVertices.length; i+=3 )
            {
                var index = i % vertices.length;
                var pos = vertices.slice(index,index + 3);
        
                // index of cube out of all cubes through all buffers
                var cubedex = Math.floor( ( i + b * BatchedCubes.MAX_PER_BUFFER * vertices.length ) / vertices.length );
        
                pos[0] = pos[0] + ( cubedex % blockSize ) * 2;
                pos[1] = pos[1] + Math.floor( cubedex / ( blockSize * blockSize ) ) * 2;
                pos[2] = pos[2] + Math.floor( ( cubedex / blockSize ) % blockSize ) * 2;
        
                batchedVertices[i] = pos[0];
                batchedVertices[i+1] = pos[1];
                batchedVertices[i+2] = pos[2];
            }

            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batchedVertices), gl.STATIC_DRAW);
        }
        

        this._indexBuffer = gl.createBuffer();    
        
        // setup batched elements
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);


        var batchedElements = [];
        batchedElements.length = cubeVertexIndices.length * BatchedCubes.MAX_PER_BUFFER;
    
        for( var i=0; i < batchedElements.length; i++ )
        {
            var index = i % cubeVertexIndices.length;
        
            // index of cube out of cubes in this current buffer
            var cubedex = Math.floor( i / cubeVertexIndices.length );
        
            batchedElements[i] = cubeVertexIndices[index] + cubedex * vertices.length / 3; // 8 vertex points in a cube - aka ( vertices / 3 )
        }

        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(batchedElements), gl.STATIC_DRAW);
    }


    render(cubeCount = -1)
    {
        if( cubeCount < 0 )
        {
            cubeCount = this._maxCubes;
        }
        else
        {
            cubeCount = Math.min(cubeCount, this._maxCubes);
        }

        for( var b=0; b < this._bufferCount; b++ )
        {
            if( cubeCount < b * BatchedCubes.MAX_PER_BUFFER )
            {
                break;
            }
        
            // Bind all cube vertices
            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffers[b]);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            // gl.vertexAttribPointer(voxelMaterials[voxelMaterialIndex].getVertexAttribute("aVertexPosition"), 3, gl.FLOAT, false, 0, 0);

        
            var elementCount = Math.min( cubeCount - b * BatchedCubes.MAX_PER_BUFFER, BatchedCubes.MAX_PER_BUFFER );
        
            // Draw the cubes.
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
            gl.drawElements(gl.TRIANGLES, 36 * elementCount, gl.UNSIGNED_SHORT, 0);
        }

    }
}