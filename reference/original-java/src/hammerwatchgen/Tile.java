package hammerwatchgen;

public class Tile {

    boolean wall;
    boolean filled;
    boolean wallSet;
    
    Tile( boolean wall) {
        
        this.wall = wall;
        filled = false;
        wallSet = false;
    }
}
