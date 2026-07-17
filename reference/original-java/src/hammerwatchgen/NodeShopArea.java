package hammerwatchgen;

import hammerwatchgen.Doodad.DoodadType;

public class NodeShopArea extends ScriptNode {

    public enum ShopType {
        
        Combo( "combo1 combo2 combo3 combo4 combo5", DoodadType.VendorCombo ),
        Offense( "off1 off2 off3 off4 off5", DoodadType.VendorOffense ),
        Defense( "def1 def2 def3 def4 def5", DoodadType.VendorDefense ),
        Misc( "misc1 misc2 misc3 misc4 misc5", DoodadType.VendorMisc );
        
        public String categories;
        public DoodadType vendor;
        ShopType( String cat, DoodadType vendor ) {
            
            this.vendor = vendor;
            categories = cat;
        }
    }
    
    ShopType shopType;
    int shapeId;
    
    NodeShopArea( float x, float y, NodeType type ) {
        
        super( x, y, type );
        
        ShopType[] array = ShopType.values();
        shopType = array[ Rand.iRand(0, array.length )];
        shapeId = 0;
    }
    
    @Override
    protected XMLDictionary getParametersDict() {
        
        XMLDictionary d = new XMLDictionary("parameters");
        d.addData( new XMLString( "cats", shopType.categories ) );
        XMLDictionary shapeDict = new XMLDictionary("shape");
        int[] shapeArray = new int[1];
        shapeArray[0] = shapeId;
        shapeDict.addData( new XMLIntArray( "static", shapeArray ));
        d.addData( shapeDict );
        return d;
    }
    
    public void connectToShape( ScriptNode n ) {
        
        shapeId = n.id;
    }
    
}
