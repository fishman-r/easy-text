import AppKit
let dest = CommandLine.arguments[1]
let variants = [(16,"16x16"),(32,"16x16@2x"),(32,"32x32"),(64,"32x32@2x"),(128,"128x128"),(256,"128x128@2x"),(256,"256x256"),(512,"256x256@2x"),(512,"512x512"),(1024,"512x512@2x")]
for (pixels,label) in variants {
 let size = CGFloat(pixels)
 let bitmap = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:pixels,pixelsHigh:pixels,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 let context = NSGraphicsContext(bitmapImageRep:bitmap)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=context
 let bounds = NSRect(x:size*0.04,y:size*0.04,width:size*0.92,height:size*0.92)
 NSColor(calibratedRed:0.075,green:0.09,blue:0.11,alpha:1).setFill()
 NSBezierPath(roundedRect:bounds,xRadius:size*0.21,yRadius:size*0.21).fill()
 NSColor(calibratedRed:0.78,green:0.94,blue:0.57,alpha:1).setFill()
 NSBezierPath(roundedRect:NSRect(x:size*0.19,y:size*0.20,width:size*0.62,height:size*0.045),xRadius:size*0.02,yRadius:size*0.02).fill()
 let attrs:[NSAttributedString.Key:Any] = [.font:NSFont.systemFont(ofSize:size*0.43,weight:.bold),.foregroundColor:NSColor(calibratedRed:0.83,green:0.97,blue:0.66,alpha:1)]
 let text = "ET" as NSString
 let measured = text.size(withAttributes:attrs)
 text.draw(at:NSPoint(x:(size-measured.width)/2,y:size*0.33),withAttributes:attrs)
 NSGraphicsContext.restoreGraphicsState()
 try bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:dest+"/icon_"+label+".png"))
}
