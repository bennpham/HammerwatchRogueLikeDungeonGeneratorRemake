package hammerwatchgen;

import hammerwatchgen.Item.ItemType;
import hammerwatchgen.Monster.MonsterType;
import hammerwatchgen.ObjectSet.SetType;
import java.util.ArrayList;

public class Room {

    static int lastLockType = 0;
    
    public enum RoomType {
        
        None,
        Entrance,
        Exit,
        Vault,
        Lair,
        Storage,
        Shop,
        Orb
    }
    
    int x;
    int y;
    int width;
    int height;
    RoomType type;
    ArrayList<Passage> passages;
    boolean flag;
    String theme;
    int level;
    MonsterType monsterType;
    boolean locked;
    
    Room( int level ) {
        passages = new ArrayList<>();
        
        // perform random generation
        width = Rand.iRand( Parameters.minRoomSize, Parameters.maxRoomSize );
        height = Rand.iRand( Parameters.minRoomSize + 2, Parameters.maxRoomSize + 2 );
        x = Rand.iRand( Parameters.edgePadding, Parameters.mapWidth - Parameters.edgePadding - width );
        y = Rand.iRand( Parameters.edgePadding, Parameters.mapHeight - Parameters.edgePadding - height );
        type = RoomType.None;
        flag = false;
        this.theme = Parameters.themes[ level ];
        this.level = level;
        locked = false;
    }
    
    public boolean overlap( Room otherRoom ) {
        
        if( x <= otherRoom.x + otherRoom.width + Parameters.roomPadding && x + width + Parameters.roomPadding >= otherRoom.x 
            && y <= otherRoom.y + otherRoom.height + Parameters.roomPadding && y + height + Parameters.roomPadding >= otherRoom.y )
        {
            return true;
        }
        
        return false;
    }
    
    public boolean contains( int x, int y ) {
        
        if( x <= this.x + this.width 
         && x >= this.x
         && y <= this.y + this.height 
         && y >= this.y )
        {
            return true;
        }
        
        return false;        
    }
    
    public boolean transform( RoomType type ) {
        
        return transform( type, passages );
    }
    
    public boolean transform( RoomType type, ArrayList<Passage> allPassages ) {
        
        float area = width * height;
        int spawners, foodDrops = 0;
        if( this.type != RoomType.None ) return false;
        switch( type ) {
        
            case Entrance:
            case Exit:    
                SetType setType;
                if( type == RoomType.Entrance ) {
                    setType = SetType.ExitUp;
                } else {
                    setType = SetType.ExitDn;
                }
                for( int attempt = 0; attempt < 20; attempt++ ) {
                    
                    boolean safe = false;
                    ObjectSet s = ObjectSet.Create(Rand.iRand( x, x + width ), y - 2, setType, theme );
                    if( s.x + s.width < x + width ) {
                        
                        safe = true;
                        // make sure it doesn't overlap with passages
                        for( Passage p : allPassages ) {
                            
                            for( int xOffset = 0; xOffset < s.width; xOffset++ ) {
                                
                                if( p.contains( s.x + xOffset, s.y )
                                 || p.contains( s.x + xOffset, s.y + 1 ) ) {
                                    safe = false;
                                    break;
                                }
                            }
                        }
                        
                        if( safe ) {
                            if( type == RoomType.Exit ) {
                                //ObjectSet.Create( x + width / 2, y + height / 2 + 1, SetType.RestoreOrb, theme );
                                this.transform( RoomType.Lair );
                                this.type = type;
                                return true;
                            } else
                            {
                                this.transform( RoomType.Storage );
                                this.type = type;
                                return true;
                            }
                        }
                    }
                    if( !safe ) {
                        ObjectSet.Delete( s );
                    }
                }
                return false;
                
            case Lair:

                monsterType = Monster.chooseMonsterForLevel(level);
                
                CreateHorde( monsterType, (int) ( Rand.fRand( Parameters.monsterCounts[ monsterType.ordinal() ] / 5, Parameters.monsterCounts[ monsterType.ordinal() ] ) * Parameters.monsterMultiplier ) );
                this.type = type;
                
                spawners = Rand.iRand(0, Parameters.monsterCounts[ monsterType.ordinal() ] / 20 );
                for( int i = 0; i < spawners; i++ ) {
                    
                    Monster.Create( Rand.fRand(x + 2, x + width - 2), Rand.fRand( y + 4, y + height - 2), monsterType, 0);
                }

                int treasurePiles = Rand.iRand(1, 4);
                for( int i = 0; i < treasurePiles; i++ ) {

                    CreateTreasure( (int) ( Rand.fRand( area / 20, area / 6 ) * Parameters.goldMultiplier ) );
                }              
                
                foodDrops = Rand.iRand( 0, 2 );
                for( int i = 0; i < foodDrops; i++ ) {

                    CreateFood( (int) ( Rand.fRand( 2, 6 ) * Parameters.foodMultiplier ) );
                } 
                
                return true;
                
            case Storage:

                monsterType = Monster.chooseMonsterForLevel(level);

                this.type = type;
                
                spawners = Rand.iRand(0, 3);
                for( int i = 0; i < spawners; i++ ) {
                    
                    Monster.Create( Rand.fRand(x + 1, x + width - 1), Rand.fRand( y + 3, y + height - 1), monsterType, 0);
                }

                int breakables = Rand.iRand(0, 4);
                for( int i = 0; i < breakables; i++ ) {

                    CreateBreakables( (int) ( Rand.fRand( area / 20, area / 6 ) * Parameters.goldMultiplier ) );
                }            
                foodDrops = Rand.iRand( 1, 3 );
                for( int i = 0; i < foodDrops; i++ ) {

                    CreateFood( (int) ( Rand.fRand( 2, 6 ) * Parameters.foodMultiplier ) );
                }   
                return true;
                
            case Shop:
                ObjectSet.Create( x + width / 2, y + height / 2 + 1, SetType.Shop, theme );
                
                breakables = Rand.iRand(0, 3);
                for( int i = 0; i < breakables; i++ ) {

                    CreateBreakables( (int) ( Rand.fRand( area / 20, area / 8 ) * Parameters.goldMultiplier ) );
                }              
                
                this.type = type;
                return true;
                
            case Vault:
                if( !lockRoom() ) return false;
                
                breakables = Rand.iRand(0, 3);
                for( int i = 0; i < breakables; i++ ) {

                    CreateBreakables( (int) ( Rand.fRand( area / 20, area / 8 ) * Parameters.goldMultiplier ) );
                }              
                
                treasurePiles = Rand.iRand(6, 8);
                for( int i = 0; i < treasurePiles; i++ ) {

                    CreateTreasure( (int) ( Rand.fRand( area / 12, area / 8 ) * Parameters.goldMultiplier ) );
                }                  
                this.type = type;
                return true;
                
            case Orb:
                if( locked ) return false;
                ObjectSet.Create( x + width / 2, y + height / 2 + 1, SetType.Orb, theme );
                
                this.type = type;
                return true;
                
            default:
                this.type = type;
                return true;
        }
        

    }
    
    
    public void CreateHorde( Monster.MonsterType type, int count ) {
        
        float originX, originY, radius;
                
        
        originX = Rand.fRand( x + 2, x + width - 2);
        originY = Rand.fRand( y + 4, y + height - 2);
        radius = Rand.fRand( 5, 15 );
                
        float driftAngle = Rand.fRand( 0,  2 * (float) Math.PI );
        float curve = Rand.fRand( 0, 0.5f ) - 0.25f;
        float drift = 6.0f / count;

        for( int i = 0; i < count; i++ ) {
            float angle = Rand.fRand( 0,  2 * (float) Math.PI );
            float r = Rand.fRand( 0, radius );
            float mx = originX + r * (float) Math.cos( (double) angle );
            float my = originY + r * (float) Math.sin( (double) angle );
            if( mx > x + width ) continue;
            else if( mx < x ) continue;
            if( my > y + height ) continue;
            else if( my < y + 2 ) continue;
            Monster.Create( mx, my, type );
            
            originX += drift * (float) Math.cos( (double) driftAngle );
            originY += drift * (float) Math.sin( (double) driftAngle );
            driftAngle += curve;
        }
    }
   
    public void CreateTreasure( int count ) {
        
        float originX, originY, radius;
        originX = Rand.fRand( x + 2, x + width - 2);
        originY = Rand.fRand( y + 4, y + height - 2);
        radius = Rand.fRand( 2, 6 );

        float driftAngle = Rand.fRand( 0,  2 * (float) Math.PI );
        float curve = Rand.fRand( 0, 0.5f ) - 0.25f;
        float drift = 10.0f / count;
        
        for( int i = 0; i < count; i++ ) {
            float angle = Rand.fRand( 0,  2 * (float) Math.PI );
            float r = Rand.fRand( 0, radius );
            float mx = originX + r * (float) Math.cos( (double) angle );
            float my = originY + r * (float) Math.sin( (double) angle );
            if( mx > x + width ) continue;
            else if( mx < x ) continue;
            if( my > y + height ) continue;
            else if( my < y + 2 ) continue;
            
            int treasureIndex = Rand.iRand(0, 5);
            treasureIndex += level;
            treasureIndex = Math.min( treasureIndex, ItemType.Treasure.typeStrings.length - 1 );
            
            Item.Create( mx, my, ItemType.Treasure, treasureIndex );
            
            originX += drift * (float) Math.cos( (double) driftAngle );
            originY += drift * (float) Math.sin( (double) driftAngle );
            driftAngle += curve;
        }
    }    

    public void CreateBreakables( int count ) {
        
        float originX, originY, radius;
        originX = Rand.fRand( x + 2, x + width - 2);
        originY = Rand.fRand( y + 4, y + height - 2);
        radius = Rand.fRand( 2, 4 );

        float driftAngle = Rand.fRand( 0,  2 * (float) Math.PI );
        float curve = Rand.fRand( 0, 0.5f ) - 0.25f;
        float drift = 10.0f / count;
        
        for( int i = 0; i < count; i++ ) {
            float angle = Rand.fRand( 0,  2 * (float) Math.PI );
            float r = Rand.fRand( 0, radius );
            float mx = originX + r * (float) Math.cos( (double) angle );
            float my = originY + r * (float) Math.sin( (double) angle );
            if( mx > x + width ) continue;
            else if( mx < x ) continue;
            if( my > y + height ) continue;
            else if( my < y + 2 ) continue;
            
            Item.Create( mx, my, ItemType.Breakable );
            
            originX += drift * (float) Math.cos( (double) driftAngle );
            originY += drift * (float) Math.sin( (double) driftAngle );
            driftAngle += curve;
        }
    }        
    
    public void CreateFood( int count ) {
        
        float originX, originY, radius;
        originX = Rand.fRand( x + 2, x + width - 2);
        originY = Rand.fRand( y + 4, y + height - 2);
        radius = Rand.fRand( 2, 4 );

        float driftAngle = Rand.fRand( 0,  2 * (float) Math.PI );
        float curve = Rand.fRand( 0, 0.5f ) - 0.25f;
        float drift = 10.0f / count;
        
        for( int i = 0; i < count; i++ ) {
            float angle = Rand.fRand( 0,  2 * (float) Math.PI );
            float r = Rand.fRand( 0, radius );
            float mx = originX + r * (float) Math.cos( (double) angle );
            float my = originY + r * (float) Math.sin( (double) angle );
            if( mx > x + width ) continue;
            else if( mx < x ) continue;
            if( my > y + height ) continue;
            else if( my < y + 2 ) continue;
            
            Item.Create( mx, my, ItemType.Food );
            
            originX += drift * (float) Math.cos( (double) driftAngle );
            originY += drift * (float) Math.sin( (double) driftAngle );
            driftAngle += curve;
        }
    }            
    
    public boolean lockRoom() {
        
        if( passages.size() != 1 
         || locked 
         || type == RoomType.Entrance
         || type == RoomType.Exit
         || type == RoomType.Orb ) return false;
        
        locked = true;
        int lockTier = Rand.iRand(0, 3); 
        Passage p = passages.get(0);
        
        PosDir entrance = new PosDir();
        
        /*if( p.beginRoom == this ) {
            
            PosDir pathPos = p.path.get(0);
            entrance.dir = pathPos.dir;
            entrance.x = pathPos.x;
            entrance.y = pathPos.y;
        } else {
            
            PosDir pathPos = p.path.get( p.path.size() - 1 );
            entrance.dir = pathPos.dir;
            entrance.x = pathPos.endX();
            entrance.y = pathPos.endY();
        }*/
        PosDir pathPos = p.path.get(0);
        entrance.dir = pathPos.dir;
        entrance.x = pathPos.x;
        entrance.y = pathPos.y;
            
        switch( entrance.dir ) {
            
            case UP:
                for( int xOffset = 0; xOffset < p.width; xOffset++ ) { // vertical doors are 2 tiles long
                    
                    Item.Create( entrance.x + xOffset + 0.5f, entrance.y, ItemType.Door, lockTier ); 
                }
                break;
                
            case DOWN:
                for( int xOffset = 0; xOffset < p.width; xOffset++ ) { // vertical doors are 2 tiles long
                    
                    Item.Create( entrance.x + xOffset + 0.5f, entrance.y + 3, ItemType.Door, lockTier ); 
                }
                break;
                
            case LEFT:
            case RIGHT:
                for( int yOffset = 0; yOffset < p.width + 1; yOffset++ ) {
                    
                    Item.Create( entrance.x + 0.5f, entrance.y + yOffset + 2, ItemType.Door, lockTier + 3 ); // add 3 for vertical doors
                }
                break;                
        }
        lastLockType = lockTier;
        
        // add loot
        Item.Create( Rand.fRand( x, x + width), Rand.fRand(y + 2, y + height ), ItemType.Powerup );
        
        return true;
    }
    
    public boolean spawnKey() {
        
        if( locked ) return false;
        Item.Create( Rand.fRand( x, x + width), Rand.fRand(y + 2, y + height ), ItemType.Key, lastLockType );
        return true;
    }
}
