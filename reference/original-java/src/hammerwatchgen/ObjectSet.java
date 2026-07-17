package hammerwatchgen;

import hammerwatchgen.Doodad.DoodadType;
import hammerwatchgen.Item.ItemType;
import hammerwatchgen.ScriptNode.NodeType;
import java.util.ArrayList;

public class ObjectSet {

    static ArrayList<ObjectSet> sets = new ArrayList<>();
    
    enum SetType {
        
        ExitUp,
        ExitDn,
        Shop,
        Orb,
        RestoreOrb
    }
    
    ArrayList<Doodad> doodads;
    ArrayList<ScriptNode> scriptNodes;
    ArrayList<Item> items;
    SetType type;
    int x;
    int y;
    int width;
    int height;
    int wallX;
    int wallY;
    int wallWidth;
    int wallHeight;
    boolean replaceWalls;
    
    public static ObjectSet Create( int x, int y, SetType type, String theme ) {
        
        ObjectSet s = new ObjectSet( x, y, type, theme );
        sets.add( s );
        return s;
    }
    
    public static void Clear() {
        
        for( ObjectSet s : sets ) {
            
            s.delete();
        }
        sets.clear();
    }
    
    public static void Delete( ObjectSet s ) {
        
        s.delete();
        sets.remove(s);
    }
    
    ObjectSet( int x, int y, SetType type, String theme ) {
        
        ScriptNode shape;
        
        doodads = new ArrayList<>();
        scriptNodes = new ArrayList<>();
        items = new ArrayList<>();
        
        this.x = x;
        this.y = y;
        this.type = type;
        
        switch( type ) {
            
            case ExitUp:
                doodads.add( Doodad.Create( x + 1,    y + 1, DoodadType.TDown, theme ) );
                doodads.add( Doodad.Create( x + 4,    y + 1, DoodadType.TDown, theme ) );
                doodads.add( Doodad.Create( x + 1,    y + 3, DoodadType.TorchOff, theme ) );
                doodads.add( Doodad.Create( x + 2,    y + 3, DoodadType.ExitUp, theme ) );
                doodads.add( Doodad.Create( x + 4,    y + 3, DoodadType.TorchOff, theme ) );
                doodads.add( Doodad.Create( x + 1.5f, y + 0.25f, DoodadType.Cover, theme ) );
                doodads.add( Doodad.Create( x + 2.5f, y + 0.25f, DoodadType.Cover, theme ) );
                doodads.add( Doodad.Create( x + 2,    y + 4, DoodadType.ExitMarker, theme ) );
                scriptNodes.add( ScriptNode.Create( x + 3, y + 5, NodeType.LevelStart ) );
                
                shape = ScriptNode.Create( x + 3, y + 5, NodeType.RectangleShape );
                scriptNodes.add( shape );
                
                NodeAreaTrigger areaTrig = (NodeAreaTrigger) ScriptNode.Create( x + 3, y + 6, NodeType.AreaTrigger );
                areaTrig.connectToShape(shape);
                scriptNodes.add( areaTrig );
                
                NodeAnnounceText levelText = (NodeAnnounceText) ScriptNode.Create( x + 3, y + 7, NodeType.AnnounceText );
                levelText.setText("Level " + ( Level.currentLevel + 1 ), 0);
                areaTrig.connectTo( levelText );
                scriptNodes.add( levelText );   
                
                NodeToggleElement toggle = (NodeToggleElement) ScriptNode.Create( x + 3, y + 8, NodeType.ToggleElement );
                toggle.connectToElement( areaTrig );
                areaTrig.connectTo( toggle );
                scriptNodes.add( toggle );   
                
                //NodeAreaTrigger areaT = (NodeAreaTrigger) ScriptNode.Create( x + 3, y + 6, NodeType.AreaTrigger );
                //areaT.connectToShape(shape);
                //scriptNodes.add( areaT );
                
                ScriptNode resScript = ScriptNode.Create( x, y + 8, NodeType.RespawnPlayers );
                areaTrig.connectTo( resScript );
                scriptNodes.add( resScript );                 
                width = 6;
                height = 5;
                wallWidth = 3;
                wallHeight = 4;
                wallX = x + 1;
                wallY = y + 1;
                replaceWalls = true;
                break;
                
            case ExitDn:
                doodads.add( Doodad.Create( x + 1,    y + 1, DoodadType.TDown, theme ) );
                doodads.add( Doodad.Create( x + 4,    y + 1, DoodadType.TDown, theme ) );
                doodads.add( Doodad.Create( x + 1,    y + 3, DoodadType.Torch, theme ) );
                doodads.add( Doodad.Create( x + 2,    y + 3, DoodadType.ExitDn, theme ) );
                doodads.add( Doodad.Create( x + 4,    y + 3, DoodadType.Torch, theme ) );
                doodads.add( Doodad.Create( x + 1.5f, y + 0.25f, DoodadType.Cover, theme ) );
                doodads.add( Doodad.Create( x + 2.5f, y + 0.25f, DoodadType.Cover, theme ) );  
                doodads.add( Doodad.Create( x + 2,    y + 4, DoodadType.ExitMarker, theme ) );
                
                shape = ScriptNode.Create( x + 3, y + 4, NodeType.RectangleShape );
                scriptNodes.add( shape );
                
                NodeLevelExit exit = (NodeLevelExit) ScriptNode.Create( x + 3, y + 6, NodeType.LevelExit );
                exit.connectToShape(shape);
                scriptNodes.add( exit );
                
                width = 6;
                height = 5;
                wallWidth = 3;
                wallHeight = 4;
                wallY = y + 1;
                wallX = x + 1;
                replaceWalls = true;
                break;      
                
            case Shop:
                shape = ScriptNode.Create( x, y, NodeType.RectangleShape );
                scriptNodes.add( shape );
                NodeShopArea shop = (NodeShopArea) ScriptNode.Create( x, y, NodeType.ShopArea );
                shop.connectToShape(shape);
                scriptNodes.add( shop );
                doodads.add( Doodad.Create( x, y, shop.shopType.vendor, theme ) );
                width = 1;
                height = 1;
                replaceWalls = false;
                break;   
                
            case Orb: // endgame
                Item orb = Item.Create( x, y, ItemType.Orb, 0 );
                items.add( orb );
                
                NodeObjectEventTrigger trigger = (NodeObjectEventTrigger) ScriptNode.Create( x, y + 2, NodeType.ObjectEventTrigger );
                trigger.connectItem( orb );
                
                NodeGameEnd textScript = (NodeGameEnd) ScriptNode.Create( x, y + 4, NodeType.GameEnd );
                trigger.connectTo( textScript );
                
                scriptNodes.add( trigger );
                scriptNodes.add( textScript );

                width = 1;
                height = 1;
                replaceWalls = false;
                break;   
                
            case RestoreOrb: //unused
                Item orbR = Item.Create( x, y, ItemType.Orb, 1 );
                items.add( orbR );
                
                NodeObjectEventTrigger triggerR = (NodeObjectEventTrigger) ScriptNode.Create( x, y + 2, NodeType.ObjectEventTrigger );
                triggerR.connectItem( orbR );
                
                NodeAnnounceText titleScript = (NodeAnnounceText) ScriptNode.Create( x, y + 4, NodeType.AnnounceText );
                titleScript.setText( "Orb of Restoration", 0);
                triggerR.connectTo( titleScript );
                
                NodeAnnounceText subScript = (NodeAnnounceText) ScriptNode.Create( x, y + 6, NodeType.AnnounceText );
                subScript.setText( "Fallen party members restored", 1);
                triggerR.connectTo( subScript );
                
                //ScriptNode resScript = ScriptNode.Create( x, y + 8, NodeType.RespawnPlayers );
                //triggerR.connectTo( resScript );
                
                scriptNodes.add( triggerR );
                scriptNodes.add( titleScript );
                scriptNodes.add( subScript );
                //scriptNodes.add( resScript );
                
                width = 1;
                height = 1;
                replaceWalls = false;
                break;                   
        }
    }
    
    public void delete() {
        
        for( Doodad d : doodads ) {
            
            Doodad.Delete(d);
        }
        
        for( ScriptNode n : scriptNodes ) {
            
            ScriptNode.Delete(n);
        }        
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
    
    public boolean containsWall( int x, int y ) {
        
        if( x <= this.wallX + this.wallWidth 
         && x >= this.wallX
         && y <= this.wallY + this.wallHeight
         && y >= this.wallY )
        {
            return true;
        }
        
        return false;        
    }    
}
