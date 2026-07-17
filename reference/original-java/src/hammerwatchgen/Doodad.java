package hammerwatchgen;

import java.util.ArrayList;

public class Doodad extends XMLObject {

    static ArrayList<Doodad> doodads = new ArrayList<>();
    
    public enum DoodadType {
        
        VendorMisc( "doodads/special/vendor_misc.xml", 0, 0, 0 ),
        VendorCombo( "doodads/special/vendor_combo.xml", 0, 0, 0 ),
        VendorOffense( "doodads/special/vendor_offense.xml", 0, 0, 0 ),
        VendorDefense( "doodads/special/vendor_defense.xml", 0, 0, 0 ),
        Spawn( "doodads/generic/marker_spawn.xml", 1, 1, 0 ),
        ExitMarker( "doodads/generic/marker_exit.xml", 0, 0, 0 ),
        CornerLD( "doodads/theme_%s/%s_crn_l_dn.xml", 0, 2, 2 ),
        CornerLU( "doodads/theme_%s/%s_crn_l_up.xml", 0, 1, 2 ),
        CornerRD( "doodads/theme_%s/%s_crn_r_dn.xml", 0, 2, 2 ),
        CornerRU( "doodads/theme_%s/%s_crn_r_up.xml", 0, 1, 2 ),
        ExitDn( "doodads/theme_%s/%s_exit_h_dn.xml", 0, 0, 2 ),
        ExitUp( "doodads/theme_%s/%s_exit_h_up.xml", 0, 0, 2 ),
        Horizontal( "doodads/theme_%s/%s_h_8.xml", 0, 2, 2 ),
        Vertical( "doodads/theme_%s/%s_v_8.xml", 0, 1, 2 ),
        Cover( "doodads/special/color_theme_%s_16.xml", 0.5f, 0.5f, 1 ),
        Torch( "doodads/generic/lamp_torch.xml", 0.5f, 1, 0 ),
        TorchOff( "doodads/generic/lamp_torch_off.xml", 0.5f, 1, 0 ),
        CrossWall( "doodads/theme_%s/%s_x_x.xml", 0, 1, 2 ),
        VCapDown( "doodads/theme_%s/%s_v_cap_dn.xml", 0, 2, 2 ),
        VCapUp( "doodads/theme_%s/%s_v_cap_up.xml", 0, 1, 2 ),
        HCapLeft( "doodads/theme_%s/%s_h_cap_l.xml", 0, 2, 2 ),
        HCapRight( "doodads/theme_%s/%s_h_cap_r.xml", 0, 2, 2 ),        
        TDown( "doodads/theme_%s/%s_x_t_dn.xml", 0, 2, 2 ),
        TUp( "doodads/theme_%s/%s_x_t_up.xml", 0, 1, 2 ),
        TLeft( "doodads/theme_%s/%s_x_t_l.xml", 0, 1, 2 ),
        TRight( "doodads/theme_%s/%s_x_t_r.xml", 0, 1, 2 );
        public String string;
        public float yOffset;
        public float xOffset;
        public int themeSubs;
        DoodadType( String name, float x, float y, int subs ) {
            
            this.string = name;
            xOffset = x;
            yOffset = y;
            themeSubs = subs;
        }
    }
    
    float x;
    float y;
    DoodadType type;
    int id;
    String theme;
    public static void Clear() {
        
        doodads.clear();
    }
    
    public static void Delete( Doodad d ) {
        
        doodads.remove( d );
    }
    
    public static Doodad Create( float x, float y, DoodadType type, String theme ) {
        
        Doodad d = new Doodad( x, y, type, theme );
        doodads.add( d );
        return d;
    }
    
    Doodad( float x, float y, DoodadType type, String theme ) {
        
        id = Level.idCounter;
        Level.idCounter++;
        this.x = x;
        this.y = y;
        this.type = type;
        this.theme = theme;
    }
    
    public String getXML() {
        
        // create XML structure
        XMLInt idInt = new XMLInt( "id", id );
        XMLString typeString = new XMLString( "type",getDoodadString( type, theme ) );
        XMLFloat xFloat = new XMLFloat( "x", x + type.xOffset );
        XMLFloat yFloat = new XMLFloat( "y", y + type.yOffset );
        XMLBool syncBool = new XMLBool( "need-sync", false );
        
        XMLDictionary doodadDict = new XMLDictionary( "" );
        doodadDict.addData(idInt);
        doodadDict.addData(typeString);
        doodadDict.addData(xFloat);
        doodadDict.addData(yFloat);
        doodadDict.addData(syncBool);
        
        return doodadDict.getXML();
    }
    
    public String getDoodadString( DoodadType type, String theme ) {
        
        switch( type.themeSubs ) {
            case 1:
                return String.format( type.string, theme );
                
            case 2:
                return String.format( type.string, theme, theme );
                
            default:
                return type.string;
        }
    }
    
}
