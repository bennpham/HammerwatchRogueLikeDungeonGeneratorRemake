package hammerwatchgen;

import java.util.Random;

public class Rand {

    static Random generator = null;
    
    static public void seed( long seed ) {
        
        generator = new Random( seed );
    }
    static public int iRand( int min, int max ) {
        
        if( max <= min ) return min;
        return generator.nextInt( max - min ) + min;
    }
    
    static public float fRand( float min, float max ) {
        
        if( max <= min ) return min;
        return generator.nextFloat() * ( max - min ) + min;
    }    
    
}
