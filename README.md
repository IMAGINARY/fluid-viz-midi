# Navier stroke

A
[WebGL-based fluid simulation app](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)
with adjusted default parameters and added idle animations targeting
exhibitions.

![Screenshot](./screenshot.jpg 'Fluid simulation screenshot')

## Options

The app's idle mode can be configured via URL parameters:

```
idleTimeout = 20 // start idle mode after 20s of inactivity
idleDuration = 3 * 60 // stop idle mode after 3min (and then wait for idleTimeout again)
touchIconDelay = 60 // show the touch icon overlay once every 1min
```

## References

[GPU Gems, Chapter 38](http://developer.download.nvidia.com/books/HTML/gpugems/gpugems_ch38.html)

[mharris' fluids-2d](https://github.com/mharrys/fluids-2d)

[haxiomic's GPU Fluid Experiments](https://github.com/haxiomic/GPU-Fluid-Experiments)

## License

The code is available under the [MIT license](LICENSE)
