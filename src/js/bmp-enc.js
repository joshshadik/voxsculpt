class BMPEnc
{
    /**
     * 
     * @param {Uint8Array} rawData 
     * @param {int} width 
     * @param {int} height 
     * @param {bool} alpha 
     */
    constructor(rawData, width, height, alpha)
    {
        this.buffer = rawData;
        this.width = width;
        this.height = height;
        this.useAlpha = alpha;
        this.channels = 3 + (this.useAlpha ? 1 :  0 );
        this.imgDataSize = this.width * this.height * this.channels;
        this.headerSize = 108; // BITMAPV4HEADER version

        this.flag = "BM";
        this.reserved = 0;
        this.imgDataOffset = this.headerSize + 14; // 14 is 2B flag + 4B fileSize + 4B reserved + 4B image data offset
        this.fileSize = this.imgDataSize + this.imgDataOffset;
        this.planes = 1;
        this.bPP = this.channels * 8; // 1 Byte / channel
        this.compression = 3; // BI_BITFIELDS
        this.hPR = 0;
        this.vPR = 0;
        this.colors = 0;
        this.importantColors = 0;
        this.redMask = 		0x00ff0000;
        this.greenMask = 	0x0000ff00;
        this.blueMask = 	0x000000ff;
        this.alphaMask = 	0xff000000;
        this.colorSpace = 	"Win "; //0x206e6957; // LCS_WINDOWS_COLOR_SPACE
    }

    static write(buf, ofs) {
        for(var i = 2; i < arguments.length; ++i )
        {
            for( var j = 0; j < arguments[i].length; ++j )
            {
                buf[ofs++] = arguments[i].charCodeAt(j);
            }
        }
    }

    static to2ByteLE(v)
    {
        return String.fromCharCode(v & 0xff, (v>>0x8) & 0xff);
    }

    static to4ByteLE(v)
    {
        return String.fromCharCode(v & 0xff, (v>>0x8) & 0xff, (v>>0x10) & 0xff, (v>>0x18) & 0xff);
    }

    encode()
    {
        var out = new Uint8Array(this.fileSize);
        this.pos = 0;

        BMPEnc.write(out, this.pos, this.flag); this.pos+=2;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.fileSize));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.reserved));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.imgDataOffset));this.pos+=4;
    
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.headerSize));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.width));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.height));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to2ByteLE(this.planes));this.pos+=2;
        BMPEnc.write(out, this.pos, BMPEnc.to2ByteLE(this.bPP));this.pos+=2;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.compression));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.imgDataSize));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.hPR));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.vPR));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.colors));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.importantColors));this.pos+=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.redMask));this.pos +=4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.greenMask));this.pos += 4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.blueMask));this.pos += 4;
        BMPEnc.write(out, this.pos, BMPEnc.to4ByteLE(this.alphaMask));this.pos += 4;
        BMPEnc.write(out, this.pos, this.colorSpace);this.pos +=4;

        for( var i = 0; i < 48; ++i )
        {
            BMPEnc.write(out, this.pos++, 0);
        }

        this.pos = this.imgDataOffset;
        var i = 0;
        var stride = ((this.channels * this.width) + 3 ) & ~3; // 4 byte alignment
        
        for( var y = this.height - 1; y >= 0; --y)
        {
            for( var x = 0; x < this.width; ++x)
            {
                var p = this.imgDataOffset + y * stride + x * this.channels;
                BMPEnc.write(out, p+2, String.fromCharCode(this.buffer[i++]));
                BMPEnc.write(out, p+1, String.fromCharCode(this.buffer[i++]));
                BMPEnc.write(out, p, String.fromCharCode(this.buffer[i++]));
                if( this.useAlpha )
                {
                    BMPEnc.write(out, p+3, String.fromCharCode(this.buffer[i++]));
                }
            }
            
        }

        return out;
    }
}