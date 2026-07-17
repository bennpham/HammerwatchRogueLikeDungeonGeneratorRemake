package hammerwatchgen;

import hammerwatchgen.Doodad.DoodadType;

public class WallPattern {

    static final int w = 1; // wall
    static final int e = 2; // emtpy
    static final int d = 0; // dont care

    static final int[][][] cornerLD_pattern =
        {    
        { { d, w, d },
          { e, w, w },
          { d, e, d },
          { d, d, d },
          { d, d, d } } };    
    
    static final int[][][] x_pattern =
        {
        { { d, w, d },
          { w, w, w },
          { e, w, d },
          { d, d, d },
          { d, d, d } },
        
        { { e, w, d },
          { w, w, w },
          { d, w, d },
          { d, d, d },
          { d, d, d } },
        
        { { d, w, e },
          { w, w, w },
          { d, w, d },
          { d, d, d },
          { d, d, d } },
        
        { { d, w, d },
          { w, w, w },
          { d, w, e },
          { d, d, d },
          { d, d, d } } };
    
    static final int[][][] cornerLU_pattern =
      { { { d, e, d },
          { e, w, w },
          { d, w, d },
          { d, d, d },
          { d, d, d } } };   
    
    static final int[][][] cornerRD_pattern =
      { { { d, w, d },
          { w, w, e },
          { d, e, d },
          { d, d, d },
          { d, d, d } } };   
    
    static final int[][][] cornerRU_pattern =
      { { { d, e, d },
          { w, w, e },
          { d, w, d },
          { d, d, d },
          { d, d, d } } };   
    
    static final int[][][] horizontal_pattern =
        {    
        { { d, e, d },
          { w, w, w },
          { d, e, d },
          { d, d, d },
          { d, d, d } } }; 
    
    static final int[][][] vertical_pattern =
        {   
        { { d, w, d },
          { e, w, e },
          { d, w, d },
          { d, d, d },
          { d, d, d } } }; 
    
    static final int[][][] hcapright_pattern =
        {   
        { { d, e, d },
          { w, w, e },
          { d, e, d },
          { d, d, d },
          { d, d, d } } }; 
    
    static final int[][][] hcapleft_pattern =
        {   
        { { d, e, d },
          { e, w, w },
          { d, e, d },
          { d, d, d },
          { d, d, d } } }; 
    
    static final int[][][] vcapup_pattern =
        {   
        { { d, e, d },
          { e, w, e },
          { d, w, d },
          { d, d, d },
          { d, d, d } } }; 
    
    static final int[][][] vcapdown_pattern =
        {   
        { { d, w, d },
          { e, w, e },
          { d, d, d },
          { d, d, d },
          { d, d, d } } }; 
    
    static final int[][][] tdown_pattern =
        {   
        { { d, w, d },
          { w, w, w },
          { d, e, d },
          { d, d, d },
          { d, d, d } } }; 

    static final int[][][] tup_pattern =
        {   
        { { d, e, d },
          { w, w, w },
          { d, w, d },
          { d, d, d },
          { d, d, d } } }; 
    
    static final int[][][] tleft_pattern =
        {   
        { { d, w, d },
          { e, w, w },
          { d, w, d },
          { d, d, d },
          { d, d, d } },
        
        { { d, w, d },
          { e, w, w },
          { d, w, d },
          { d, d, d },
          { d, d, d } }};     
    
    static final int[][][] tright_pattern =
        {   
        { { d, w, d },
          { w, w, e },
          { d, w, d },
          { d, d, d },
          { d, d, d } },
        
        { { d, w, d },
          { w, w, e },
          { d, w, d },
          { d, d, d },
          { d, d, d } } };   
    
    static final int[][][] cover_pattern =
      { { { d, d, d },
          { d, w, w },
          { d, w, w },
          { d, d, d },
          { d, d, d } } };
    
    static final int[][][] debug_pattern =
      { { { d, d, d },
          { d, w, d },
          { d, d, d },
          { d, d, d },
          { d, d, d } } };
    
    public enum Pattern {
        
        PCornerLD( DoodadType.CornerLD, cornerLD_pattern, true ),
        PCornerRD( DoodadType.CornerRD, cornerRD_pattern, true ),
        PCornerLU( DoodadType.CornerLU, cornerLU_pattern, true ),
        PCornerRU( DoodadType.CornerRU, cornerRU_pattern, true ),
        PHorizontal( DoodadType.Horizontal, horizontal_pattern, true ),
        PVertical( DoodadType.Vertical, vertical_pattern, true ),
        PCover( DoodadType.Cover, cover_pattern, false ),
        PCross( DoodadType.CrossWall, x_pattern, true ),
        PHCapRight( DoodadType.HCapRight, hcapright_pattern, true ),
        PHCapLeft( DoodadType.HCapLeft, hcapleft_pattern, true ),
        PVCapUp( DoodadType.VCapUp, vcapup_pattern, true ),
        PVCapDown( DoodadType.VCapDown, vcapdown_pattern, true ),
        PTDown( DoodadType.TDown, tdown_pattern, true ),
        PTUp( DoodadType.TUp, tup_pattern, true ),
        PTLeft( DoodadType.TLeft, tleft_pattern, true ),
        PTRight( DoodadType.TRight, tright_pattern, true );
        //PDebug( DoodadType.Spawn, debug_pattern, true );
        
        public DoodadType doodad;
        public int[][][] pattern;
        public boolean wall;
        Pattern( DoodadType doodad, int[][][] array, boolean wall ) {
            
            this.doodad = doodad;
            this.pattern = array;
            this.wall = wall;
        }
    }
    
    static public DoodadType searchPatterns( int x, int y, Tile[] tileArray, int width, boolean wall ) {
        
        for( Pattern p : Pattern.values() ) {
            
            if( p.wall == wall ) {
                
                for( int pi = 0; pi < p.pattern.length; pi++ ) {
                    
                    boolean match = true;
                    out:
                    for( int xi = 0; xi < 3; xi++ ) {
                        int xOffset = xi - 1;
                        for( int yi = 0; yi < 5; yi++ ) {
                           int yOffset = yi - 1; 

                           boolean isWall = true;
                           int index = x + xOffset + ( y + yOffset ) * width;
                           if( index < tileArray.length
                            && index >= 0 ) {
                               Tile tile = tileArray[ index ];
                               isWall = tile.wall;
                           }
                           
                            if( p.pattern[ pi ][ yi ][ xi ] != d )
                            {
                                 if( p.pattern[ pi ][ yi ][ xi ] == w ) {

                                     if( isWall ) {
                                         // match
                                     }
                                     else
                                     {
                                         // not a match
                                         match = false;
                                         break out;
                                     }
                                 } else {

                                     if( isWall ) {
                                         // not a match
                                         match = false;
                                         break out;
                                     }
                                     else
                                     {
                                         // match
                                     }
                                 }
                            }
                        }
                    }
                    if( match ) {
                        return p.doodad;
                    }
                }
            }
        }
        
        return null;
    }
        
}
