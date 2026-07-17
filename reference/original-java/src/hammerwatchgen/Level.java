package hammerwatchgen;

import hammerwatchgen.Doodad.DoodadType;
import java.util.ArrayList;

public class Level {

    static final int tilemapSize = 20;
    static int currentLevel;
    static int idCounter = 0;
    
    enum Tilemap {
    
        A_Default( "tilemaps/a_default.xml", 2 ),
        B_Default( "tilemaps/b_default.xml", 4 ),
        C_Default( "tilemaps/c_default.xml", 4 ),
        D_Default( "tilemaps/d_default.xml", 8 ),
        E_Default( "tilemaps/e_default.xml", 2 ),
        F_Default( "tilemaps/f_default.xml", 2 ),
        G_Default( "tilemaps/g_default.xml", 2 ),
        I_Default( "tilemaps/i_default.xml", 8 );
        
        public XMLString string;
        public int tiles;
        Tilemap( String name, int tiles ) {
            
            this.string = new XMLString( "tileset", name );
            this.tiles = tiles;
        }
    }
        
    
    
    int levelNum;
    int width;
    int height;
    ArrayList<Room> rooms;
    Tile[] tileArray;
    ArrayList<Passage> passageList;
    boolean levelValid;
    String theme;
    Level( int level ) {
        
        idCounter = 0;
        theme = Parameters.themes[ level ];
        levelValid = true;
        rooms = new ArrayList<>();
        passageList = new ArrayList<>();
        
        levelNum = level;
        currentLevel = levelNum;
        width = Parameters.mapWidth;
        height = Parameters.mapHeight;
        
        // generate rooms
        int roomCount = Rand.iRand( Parameters.minRoomCount, Parameters.maxRoomCount );
        
        for( int i = 0; i < roomCount; i++ ) {
            for( int attempt = 0; attempt < 1000; attempt++ ) {
                
                Room newRoom = new Room( levelNum );
                // check for conflicts with existing rooms
                boolean conflict = false;
                for( Room r : rooms ) {
                    
                    if( newRoom.overlap( r ) ) {
                        conflict = true;
                        break;
                    }
                }
                if( !conflict ) {
                    rooms.add(newRoom);
                    break;
                }
            }
        }
        
        // generate passages
        ArrayList<Room> doneList = new ArrayList<>();
        ArrayList<Room> newList = new ArrayList<>( rooms );
        
        doneList.add( newList.get(0) );
        newList.remove( newList.get(0) );
        
        for( int attempt = 0; attempt < 1000; attempt++ ) {
            
            if( newList.isEmpty() ) {
                break;
            }
            
            Room toRoom = newList.get( Rand.iRand(0, newList.size() ) );
            Room fromRoom = doneList.get( Rand.iRand(0, doneList.size() ) );
            Passage newPassage = new Passage( fromRoom, toRoom );
            
            // check for passage overlaps
            boolean overlap = false;
            for( Passage p : passageList ) {
                
                if( p.overlap( newPassage ) ) {
                    overlap = true;
                    break;
                }
            }
            if( !overlap ) {
                
                for( Room r : rooms ) {

                    if( r != toRoom
                     && r != fromRoom
                     && newPassage.overlap( r ) ) {
                        overlap = true;
                        break;
                    }
                }         
            }
            
            if( !overlap ) {
                // passage is good
                newPassage.finish();
                passageList.add( newPassage );
                newList.remove( toRoom );
                doneList.add( toRoom );
            }            
        }
        
        if( !newList.isEmpty() ) {
            // level generation failed
            levelValid = false;
        }
        
        // create special rooms
        
        // entrance
        boolean success = false;
        for( int attempt = 0; attempt < 2000; attempt++ ) {
            Room r = rooms.get( Rand.iRand(0, rooms.size()));
            if( r.transform(Room.RoomType.Entrance, passageList)) {
                success = true;
                break;
            }
        }
        
        if( !success ) {
            // level generation failed
            levelValid = false;
        }
        
        // exit 
        if( levelNum < Parameters.levels - 1 ) {
            success = false;
            for( int attempt = 0; attempt < 2000; attempt++ ) {
                Room r = rooms.get( Rand.iRand(0, rooms.size()));
                if( r.transform(Room.RoomType.Exit, passageList)) {
                    success = true;
                    break;
                }
            }

            if( !success ) {
                // level generation failed
                levelValid = false;
            }
        } else {
            
            // final level
            success = false;
            for( int attempt = 0; attempt < 2000; attempt++ ) {
                Room r = rooms.get( Rand.iRand(0, rooms.size()));
                if( r.transform(Room.RoomType.Orb)) {
                    success = true;
                    break;
                }
            }

            if( !success ) {
                // level generation failed
                levelValid = false;
            }            
            
        }
        
        // shop
        if( Rand.fRand(0, 1) < Parameters.shopChance ) {
            
            for( Room r : rooms ) {
            
                if( r.transform(Room.RoomType.Shop)) break;
            }
        }
        
        // vault
        if( Rand.fRand(0, 1) < Parameters.vaultChance ) {
            
            for( Room r : rooms ) {
            
                if( r.transform(Room.RoomType.Vault)) break;
            }
        }        
        
        // locked room
        if( Rand.fRand(0, 1) < Parameters.lockChance ) {
            
            for( Room r : rooms ) {
            
                if( r.lockRoom() ) break;
            }
        }        
        
        // spawn key
        if( Rand.fRand(0, 1) < Parameters.keyChance ) {
            
            for( Room r : rooms ) {
            
                if( r.spawnKey() ) break;
            }
        } 
               
        // assign remaining rooms
        for( Room r : rooms  ) {
            
            r.transform(Room.RoomType.Lair);
        } 
        
        
        // build level data
        buildTileArray();
        buildWalls();
    }
    
    // generate XML structure for level
    public String getXML() {
        
        // tile maps
        XMLArray tiledataArray = new XMLArray( "tiledata" ); 
        
        // create 20x20 blocks of tilemaps
        int xTiles = (int) Math.ceil( (double) Parameters.mapWidth / (double) tilemapSize );
        int yTiles = (int) Math.ceil( (double) Parameters.mapHeight / (double) tilemapSize );        
        
        for( int x = 0; x < xTiles + 1; x++ ) {
            for( int y = 0; y < yTiles + 1; y++ ) {
                
                XMLDictionary tileSet = new XMLDictionary( "" );
                switch( theme ) {
                
	                case "i":
	            		tileSet.addData( Tilemap.I_Default.string );
	            		break;
                
	                case "g":
	            		tileSet.addData( Tilemap.G_Default.string );
	            		break;
                
	                case "f":
	            		tileSet.addData( Tilemap.F_Default.string );
	            		break;
                
                	case "e":
                		tileSet.addData( Tilemap.E_Default.string );
                		break;
                    
                    case "d":
                        tileSet.addData( Tilemap.D_Default.string );
                        break;
                                            
                    case "c":
                        tileSet.addData( Tilemap.C_Default.string );
                        break;
                        
                    case "b":
                        tileSet.addData( Tilemap.B_Default.string );
                        break;
                    
                    default:
                        tileSet.addData( Tilemap.A_Default.string );
                        break;
                }
                
                tileSet.addData( new XMLIntArray( "data-t", getTiles( x * tilemapSize, y * tilemapSize, Tilemap.A_Default ) ) );
                tileSet.addData( defaultIntArray( "data-r" ) );
                tileSet.addData( defaultIntArray( "data-g" ) );
                tileSet.addData( defaultIntArray( "data-b" ) );
                tileSet.addData( defaultIntArray( "data-a" ) );
                
                XMLArray dataSets = new XMLArray( "datasets" );
                dataSets.addData(tileSet);
             
                XMLDictionary tileBlock = new XMLDictionary( "" );
                tileBlock.addData( new XMLInt( "x", x * tilemapSize ) );
                tileBlock.addData( new XMLInt( "y", y * tilemapSize ) );
                tileBlock.addData( dataSets );   
                
                tiledataArray.addData(tileBlock);
            }
        }
        
        XMLDictionary tilemapDict = new XMLDictionary( "tilemap" );
        tilemapDict.addData( tiledataArray );
        
        // doodads
        XMLArray doodadsArray = new XMLArray( "doodads" ); 
        for( Doodad d : Doodad.doodads ) {
            
            doodadsArray.addData( d );
        }

        XMLDictionary doodadsDict = new XMLDictionary( "doodads" );
        doodadsDict.addData( doodadsArray );

        // actors
        XMLArray actorsArray = new XMLArray( "actors" ); 
        for( Monster m : Monster.monsters ) {
            
            actorsArray.addData( m );
        }

        XMLDictionary actorsDict = new XMLDictionary( "actors" );
        actorsDict.addData( actorsArray );        
        
        // items
        XMLArray itemsArray = new XMLArray( "items" ); 
        for( Item i : Item.items) {
            
            itemsArray.addData( i );
        }

        XMLDictionary itemsDict = new XMLDictionary( "items" );
        itemsDict.addData( itemsArray );           
        
        // scripts
        XMLArray nodesArray = new XMLArray( "nodes" ); 
        for( ScriptNode n : ScriptNode.nodes) {
            
            nodesArray.addData( n );
        }

        XMLDictionary scriptingDict = new XMLDictionary( "scripting" );
        scriptingDict.addData( nodesArray );  
        
        // lighting
        XMLArray lightingArray = new XMLArray( "lights" ); 

        XMLDictionary ambientDict = new XMLDictionary( "ambient-color" );
        ambientDict.addData( new XMLInt( "r", 255 ) );
        ambientDict.addData( new XMLInt( "g", 255 ) );
        ambientDict.addData( new XMLInt( "b", 255 ) );
        ambientDict.addData( new XMLInt( "a", 255 ) );
        
        XMLDictionary shadowDict = new XMLDictionary( "shadow-color" );
        shadowDict.addData( new XMLInt( "r", 128 ) );
        shadowDict.addData( new XMLInt( "g", 128 ) );
        shadowDict.addData( new XMLInt( "b", 128 ) );
        shadowDict.addData( new XMLInt( "a", 128 ) );
        
        XMLDictionary lightingDict = new XMLDictionary( "lighting" );
        lightingDict.addData( lightingArray );
        lightingDict.addData( ambientDict );
        lightingDict.addData( shadowDict );
        
        // create master dictionary
        XMLDictionary masterDict = new XMLDictionary( "" );
        masterDict.addData( tilemapDict );
        masterDict.addData( doodadsDict );
        masterDict.addData( actorsDict );
        masterDict.addData( scriptingDict );
        masterDict.addData( itemsDict );
        masterDict.addData( lightingDict );
        
        return masterDict.getXML();
    }
    
    private int[] getTiles( int x, int y, Tilemap map ) {
        
        int[] tiles = new int[tilemapSize * tilemapSize];
        for( int i = 0; i < tilemapSize * tilemapSize; i++ ) {
            int tileX = (x-10) + i % tilemapSize;
            int tileY = (y-10) + i / tilemapSize;
            int tileIndex = tileX + tileY * width;
            if( tileIndex >= 0 && tileIndex < width * height && tileX >= 0 && tileX < width && tileY >= 0 && tileY < height && !tileArray[tileIndex].wall ) {
                tiles[ i ] = (int) ( Math.random() * map.tiles ) + 1;
            } else {
                
                tiles[ i ] = 0;
            }
        }
        return tiles;
    }
    
    private XMLIntArray defaultIntArray( String name ) {
        
        XMLIntArray data = new XMLIntArray( name, new int[tilemapSize * tilemapSize] );
        for( int i = 0; i < tilemapSize * tilemapSize; i++ ) {
            data.data[ i ] = 255;
        }
        return data;
    }
    
    private void buildTileArray() {
        
        tileArray = new Tile[ width * height ];
        for( int i = 0; i < width * height; i++ ) {
            
            tileArray[i] = new Tile( false );
            
            int x = i % width;
            int y = i / width;
            
            boolean isWall = true;
            // check rooms
            for( Room r : rooms ) {
                
                if( r.contains(x, y) ) {
                    isWall = false;
                    break;
                }
            }
            
            // check passages
            if( isWall ) {
                for( Passage p : passageList ) {

                    if( p.contains(x, y) ) {
                        isWall = false;
                        break;
                    }
                }
            }
            
            tileArray[i].wall = isWall;
            
            // check for wall replacing object sets
            for( ObjectSet s : ObjectSet.sets ) {
                
                if( s.replaceWalls && s.containsWall( x, y ) ) {
                    tileArray[i].wallSet = true;
                }
            }
        }
    }
    
    private void buildWalls() {
        
        for( int i = 0; i < width* height; i++ ) {
            
            int x = i % ( width );
            int y = i / ( width );
            
            //if( !tileArray[ i ].wall ) {
            //    continue; // temporary shortcut
            //}
            
            if( tileArray[i].wallSet ) continue;
            
            DoodadType type = WallPattern.searchPatterns(x, y, tileArray, width, true);
            
            if( type != null ) {
                
                // create the new doodad
                Doodad.Create(x, y, type, theme );

            }
            
            // check for non-wall doodads, like cover
            type = WallPattern.searchPatterns(x, y, tileArray, width, false );
            
            if( type != null ) {
                
                // create the new doodad
                Doodad.Create( x, y, type, theme );
            }            
        }
        
    }
    
}
