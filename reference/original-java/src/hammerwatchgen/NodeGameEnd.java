package hammerwatchgen;

public class NodeGameEnd extends ScriptNode {
	
	String text;
	
	NodeGameEnd (float x, float y, NodeType type) {
		
		super( x, y, type);
		
		text = "YOU WIN!!";
	}

	@Override
	protected XMLDictionary getParametersDict() {
		
		XMLDictionary d = new XMLDictionary("parameters");
		d.addData( new XMLString( "text", text ) );
		
		return d;
	}
	
	public void setText( String newText, int type ) {
        
        text = newText;
    }
}
