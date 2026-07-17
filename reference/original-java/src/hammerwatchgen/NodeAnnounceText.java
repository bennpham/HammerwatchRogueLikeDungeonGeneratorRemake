package hammerwatchgen;

public class NodeAnnounceText extends ScriptNode {

    String text;
    int time;
    int textType;
    
    NodeAnnounceText( float x, float y, NodeType type ) {
        
        super( x, y, type );
        
        text = "You win!!!";
        time = 10000;
        textType = 0;
    }
    
    @Override
    protected XMLDictionary getParametersDict() {
        
        XMLDictionary d = new XMLDictionary("parameters");
        d.addData( new XMLString( "text", text ) );
        d.addData( new XMLInt( "time", time ) );
        d.addData( new XMLInt( "type", textType ) );
        
        return d;
    }
    
    public void setText( String newText, int type ) {
        
        text = newText;
    }
}


