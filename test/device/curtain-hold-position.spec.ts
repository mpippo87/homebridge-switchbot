import { describe, expect, it, vi } from 'vitest'

import { getDeviceCommandHandler } from '../../src/deviceCommandMapper'
import { RollerShadeDevice } from '../../src/devices/genericDevice'

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

describe('curtain hold position', () => {
  it('should expose HomeKit HoldPosition for Roller Shade and send pause', async () => {
    const client = { setDeviceState: vi.fn().mockResolvedValue({ status: 'success' }) }
    const rollerShade = new RollerShadeDevice(
      { id: 'shade1', type: 'Roller Shade', log: mockLogger },
      { _client: client, blePollingEnabled: false, log: mockLogger } as any,
    )

    const accessory = rollerShade.createHAPAccessory({})
    const windowCovering = accessory.services.find((service: any) => service.type === 'WindowCovering')

    expect(windowCovering.characteristics.HoldPosition).toBeDefined()

    await windowCovering.characteristics.HoldPosition.set()

    expect(client.setDeviceState).toHaveBeenCalledWith('shade1', {
      command: 'pause',
      parameter: 'default',
      commandType: 'command',
    })
  })

  it('should route Roller Shade pause commands to the device pause method', async () => {
    const pause = vi.fn().mockResolvedValue({ status: 'success' })
    const handler = getDeviceCommandHandler('roller shade', 'pause')

    await handler?.({ pause }, {})

    expect(pause).toHaveBeenCalledOnce()
  })

  it('should send Roller Shade OpenAPI positions as numeric parameters', async () => {
    const sendAPICommand = vi.fn().mockResolvedValue({ success: true })
    const setPosition = vi.fn()
    const handler = getDeviceCommandHandler('roller shade', 'setPosition')

    const result = await handler?.({
      hasAPI: () => true,
      sendAPICommand,
      setPosition,
    }, { parameter: '50' })

    expect(result).toBe(true)
    expect(sendAPICommand).toHaveBeenCalledWith('setPosition', 50)
    expect(setPosition).not.toHaveBeenCalled()
  })

  it('should fall back to the Roller Shade device method when OpenAPI is unavailable', async () => {
    const setPosition = vi.fn().mockResolvedValue(true)
    const handler = getDeviceCommandHandler('roller shade', 'setPosition')

    const result = await handler?.({
      hasAPI: () => false,
      sendAPICommand: vi.fn(),
      setPosition,
    }, { parameter: '75' })

    expect(result).toBe(true)
    expect(setPosition).toHaveBeenCalledWith(75)
  })

  it('should expose momentary up/down/stop switches for blind control', async () => {
    const client = { setDeviceState: vi.fn().mockResolvedValue({ status: 'success' }) }
    const rollerShade = new RollerShadeDevice(
      { id: 'shade1', name: 'Office Blind', type: 'Roller Shade', log: mockLogger },
      { _client: client, blePollingEnabled: false, log: mockLogger } as any,
    )

    const accessory = rollerShade.createHAPAccessory({})
    const upAccessory = accessory.commandAccessories.find((commandAccessory: any) => commandAccessory.id === 'blind-up-command')
    const downAccessory = accessory.commandAccessories.find((commandAccessory: any) => commandAccessory.id === 'blind-down-command')
    const stopAccessory = accessory.commandAccessories.find((commandAccessory: any) => commandAccessory.id === 'blind-stop-command')
    const up = upAccessory.services.find((service: any) => service.type === 'Switch')
    const down = downAccessory.services.find((service: any) => service.type === 'Switch')
    const stop = stopAccessory.services.find((service: any) => service.type === 'Switch')

    expect(upAccessory?.name).toBe('Blind Up')
    expect(downAccessory?.name).toBe('Blind Down')
    expect(stopAccessory?.name).toBe('Blind Stop')

    await up.characteristics.On.set(true)
    await up.characteristics.On.set(true)
    await down.characteristics.On.set(true)
    await stop.characteristics.On.set(true)

    expect(client.setDeviceState).toHaveBeenNthCalledWith(1, 'shade1', {
      command: 'setPosition',
      parameter: '0',
      commandType: 'command',
    })
    expect(client.setDeviceState).toHaveBeenNthCalledWith(2, 'shade1', {
      command: 'pause',
      parameter: 'default',
      commandType: 'command',
    })
    expect(client.setDeviceState).toHaveBeenNthCalledWith(3, 'shade1', {
      command: 'setPosition',
      parameter: '100',
      commandType: 'command',
    })
    expect(client.setDeviceState).toHaveBeenNthCalledWith(4, 'shade1', {
      command: 'pause',
      parameter: 'default',
      commandType: 'command',
    })
  })
})
