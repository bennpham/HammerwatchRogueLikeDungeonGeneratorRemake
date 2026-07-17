package hammerwatchgen;

public class PosDir {

    public enum Dir {
        
        UP( 0, -1, 1, 0 ),
        RIGHT( 1, 0, 0, 1 ),
        DOWN( 0, 1, 1, 0 ),
        LEFT( -1, 0, 0, 1 );
        
        public int xDir;
        public int yDir;
        public int xCross;
        public int yCross;        
        Dir( int x, int y, int cx, int cy ) {
            
            xDir = x;
            yDir = y;
            xCross = cx;
            yCross = cy;
        }
    }
    
    public int x;
    public int y;
    public Dir dir;
    public int length;
    PosDir( int x, int y, Dir dir ) {
        this.x = x;
        this.y = y;
        this.dir = dir;
        length = 0;
    }
    
    PosDir() {
        this.x = 0;
        this.y = 0;
        length = 0;
        this.dir = Dir.UP;
    }
    
    public boolean contains( int x, int y, int border ) {
        
        switch( this.dir ) {
            
            case UP:
                if( x >= this.x - border
                 && x <= this.x + border
                 && y >= this.y - length 
                 && y <= this.y )
                    return true;
                break;
                
            case DOWN:
                if( x >= this.x - border
                 && x <= this.x + border 
                 && y >= this.y 
                 && y <= this.y + length )
                    return true;
                break;
                
            case LEFT:
                if( y >= this.y - border
                 && y <= this.y + border
                 && x >= this.x - length 
                 && x <= this.x )
                    return true;
                break;
                
            case RIGHT:
                if( y >= this.y - border
                 && y <= this.y + border
                 && x >= this.x 
                 && x <= this.x + length )
                    return true;
                break;                
        }

        return false;
    }

    public boolean overlap( PosDir other, int border ) {
        
        for( int i = 0; i < length; i++ ) {

            if( this.contains( other.x + i * other.dir.xDir, other.y + i * other.dir.yDir, border ) ) return true;
        }
        return false;
    }
    
    public void step() {
        
        length++;
    }
    
    public int endX() {
        
        return x + length * dir.xDir;
    }

    public int endY() {
        
        return y + length * dir.yDir;
    }
    
    public PosDir turn( Dir newDir, int width ) {
        
        PosDir p = new PosDir( this.x + length * dir.xDir, this.y + length * dir.yDir, newDir );
        switch( newDir ) {
            
            case UP:
                
                if( dir == Dir.RIGHT ) {
                    
                    p.y += width + 1;
                }
                break;
                
            case LEFT:
                
                if( dir == Dir.DOWN ) {
                    
                    p.x += width - 1;
                }
                break;                
        }
        p.length = width;
        return p;
    }
}
