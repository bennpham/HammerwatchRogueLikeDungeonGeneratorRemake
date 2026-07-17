package hammerwatchgen;

import hammerwatchgen.PosDir.Dir;
import static hammerwatchgen.PosDir.Dir.UP;
import java.util.ArrayList;

public class Passage {

    Room beginRoom;
    Room endRoom;
    int width;
    ArrayList<PosDir> path;
    boolean secret;
    
    Passage( Room from, Room to ) {
        
        path = new ArrayList<>();
        beginRoom = from;
        endRoom = to;
        secret = false; // secret passages not implemented
        
        // Generate properties
        width = Rand.iRand( Parameters.minPassageWidth, Parameters.maxPassageWidth );
        
        // determine starting room door location
        PosDir begin = new PosDir();
        
        int xQuadrant = 0;
        int yQuadrant = 0;
        if( to.x + to.width < from.x ) {
            xQuadrant = -1;
        } else if( to.x > from.x + from.width ) {
            xQuadrant = 1;
        }
        if( to.y + to.height < from.y ) {
            yQuadrant = -1;
        } else if( to.y > from.y + from.height ) {
            yQuadrant = 1;
        }
        
        int XorY = Rand.iRand(0, 1);
        if( ( xQuadrant == 0 || XorY == 1 )
         && yQuadrant != 0 )
          {
            if( yQuadrant == 1 ) 
                begin.dir = Dir.DOWN;
            else 
                begin.dir = Dir.UP;
            
        } else if( ( yQuadrant == 0 || XorY == 0 )
                && xQuadrant != 0 ) 
        {
            if( xQuadrant == 1 )
                begin.dir = Dir.RIGHT;
            else
                begin.dir = Dir.LEFT;
        } 
        
        // determine 'door' placement
        placePassageDoor( from, begin, width );
        
        // determine end door location
        PosDir end = new PosDir();
        PosDir lastPos = begin;
        boolean corner;
        switch( begin.dir ) {
            
            case UP:
            case DOWN:
                if( xQuadrant == 0 
                 && begin.x + width <= to.x + to.width
                 && begin.x >= to.x ) {
                        
                    end.y = begin.y;
                    corner = false;
                } else {
                    
                    end.y = Rand.iRand( to.y, to.y + to.height - width - 2 );
                    corner = true;
                }
                
                lastPos = begin;
                path.add(lastPos);
                while( lastPos.endY() != end.y ) {

                    lastPos.step();
                }               
                
                if( corner ) {
                    // turn corner towards dest
                    if( lastPos.endX() <= to.x ) {

                        lastPos = lastPos.turn( Dir.RIGHT, width );
                        path.add(lastPos);

                    } else if( lastPos.endX() > to.x + to.width ) {

                        lastPos = lastPos.turn( Dir.LEFT, width );
                        path.add(lastPos);
                    }                
                }
                break;
                

                
            case LEFT:
            case RIGHT:
                if( yQuadrant == 0
                 && begin.y + width + 2 <= to.y + to.height
                 && begin.y >= to.y ) {
                        
                    end.x = begin.x;
                    corner = false;
                } else {
                    
                    end.x = Rand.iRand( to.x, to.x + to.width - width );
                    corner = true;
                }
                
                // generate first leg of path
                lastPos = begin;
                path.add(lastPos);
                while( lastPos.endX() != end.x ) {
                    lastPos.step();
                }                
                
                if( corner ) {
                    // turn corner towards dest
                    if( lastPos.endY() <= to.y ) {

                        lastPos = lastPos.turn( Dir.DOWN, width );
                        path.add(lastPos);

                    } else if( lastPos.endY() > to.y + to.height ) {

                        lastPos = lastPos.turn( Dir.UP, width );
                        path.add(lastPos);
                    }
                }
                break;
        }
        
        // keep going until we hit the room
        int sanity = 0;
        while( !to.contains( lastPos.endX(), lastPos.endY() ) && sanity < 1000 ) {
            lastPos.step();
            sanity++;
        }
        if( lastPos.length > 0 ) lastPos.length -= 1;
    }
    
    private void placePassageDoor( Room r, PosDir begin, int passageWidth ) {
        
        switch( begin.dir ) {
            
            case UP:
                begin.y = r.y - 1;
                begin.x = r.x + Rand.iRand(0, r.width - passageWidth );
                break;
                
            case DOWN:
                begin.y = r.y + r.height + 1;
                begin.x = r.x + Rand.iRand(0, r.width - passageWidth );
                break;   
                
            case LEFT:
                begin.x = r.x - 1;
                begin.y = r.y + Rand.iRand(0, r.height - passageWidth );
                break;                
                
            case RIGHT:
                begin.x = r.x + r.width + 1;
                begin.y = r.y + Rand.iRand(0, r.height - passageWidth );
                break;                
        }
    }
    
    public boolean overlap( Passage otherP ) {
        
        for( PosDir thisPos : path ) {
            
            int realWidth = this.width;
            if( thisPos.dir == Dir.LEFT || thisPos.dir == Dir.RIGHT ) realWidth += 2;
            
            int index = 0;
            for( int l = 0; l < thisPos.length; l++ ) {
                for( int w = -1; w < realWidth + 1; w++ ) {

                    int thisX = thisPos.x + l * thisPos.dir.xDir + w * thisPos.dir.xCross;
                    int thisY = thisPos.y + l * thisPos.dir.yDir + w * thisPos.dir.yCross;
                    
                    for( PosDir otherPos: otherP.path ) {

                        int orealWidth = otherP.width;
                        if( otherPos.dir == Dir.LEFT || otherPos.dir == Dir.RIGHT ) orealWidth += 2;   
                        
                        for( int ol = 0; ol < otherPos.length; ol++ ) {
                            for( int ow = 0; ow < orealWidth; ow++ ) {
                                if( otherPos.x + ol * otherPos.dir.xDir + ow * otherPos.dir.xCross == thisX
                                 && otherPos.y + ol * otherPos.dir.yDir + ow * otherPos.dir.yCross == thisY ) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
        return false;
    }
    
    public void finish() {
        
        beginRoom.passages.add( this );
        endRoom.passages.add( this );
    }
    
    public boolean overlap( Room room ) {
        
        for( PosDir pos: path ) {
            
            switch( pos.dir ) {
                
                case UP:
                case DOWN:
                    for( int l = 0; l < pos.length; l++ ) {
                        for( int i = -1; i < width + 1; i++ ) {
                            if( room.contains( pos.x + i + pos.dir.xDir * l, pos.y + pos.dir.yDir * l ) ) {
                                return true;
                            }
                        }
                    }
                    break;
                    
                case LEFT:
                case RIGHT:
                    for( int l = 0; l < pos.length; l++ ) {
                        for( int i = -1; i < width + 3; i++ ) {
                            if( room.contains( pos.x + pos.dir.xDir * l, pos.y + pos.dir.yDir * l + i ) ) {
                                return true;
                            }
                        }
                    }                    
                    break;                    
            }
        }
        return false;
    }
    
    public boolean contains( int x, int y ) {
        
        for( PosDir pos: path ) {
            
            switch( pos.dir ) {
                
                case UP:
                case DOWN:
                    for( int i = 0; i < width; i++ ) {
                        if( pos.contains( x - i, y, 0 ) ) {
                            return true;
                        }
                    }
                    break;
                    
                case LEFT:
                case RIGHT:
                    for( int i = 0; i < width + 2; i++ ) {
                        if( pos.contains( x, y - i, 0 ) ) {
                            return true;
                        }
                    }
                    break;                    
            }
            
        }
        return false;
    }    
}
